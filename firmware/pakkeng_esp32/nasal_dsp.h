// nasal_dsp.h — the signal math of the PakKeng device, kept free of Arduino code so it can be tested on a computer
// (firmware/test/test_nasal_dsp.cpp). One window (25 ms by default) of the two INMP441 channels becomes one message:
//   nasalPercent = 100 * A_nasal / (A_nasal + A_oral), A = RMS after the same band filter on both channels
//   nasalDb / oralDb = broadband level of each channel in dBFS (DC removed); a channel with only zero samples = dead
//   clip = a raw sample reached full scale in this window
//   speechDetected = the band level is clearly above the learned noise floor (with a short hangover)
// Message format: docs/DEVICE_PROTOCOL.md. Every threshold here is a prototype default — re-measure with the real
// baffle and microphones before relying on it.

#pragma once

#include <math.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

namespace pakkeng {

/** INMP441 gives 24-bit samples: full scale is 2^23. */
constexpr float kFullScale = 8388608.0f;
constexpr float kInvFullScale = 1.0f / kFullScale;
constexpr float kPi = 3.14159265358979f;
/** Lowest level reported as a number; anything quieter is still far below the web's dead-channel line (-96 dBFS). */
constexpr float kFloorDb = -150.0f;

/** Second-order filter (transposed direct form II). */
struct Biquad {
  float b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  float z1 = 0, z2 = 0;

  /** Band-pass with 0 dB at the centre (RBJ cookbook). */
  void bandPass(float fs, float centerHz, float q) {
    const float w0 = 2.0f * kPi * centerHz / fs;
    const float alpha = sinf(w0) / (2.0f * q);
    const float a0 = 1.0f + alpha;
    b0 = alpha / a0;
    b1 = 0.0f;
    b2 = -alpha / a0;
    a1 = -2.0f * cosf(w0) / a0;
    a2 = (1.0f - alpha) / a0;
    z1 = z2 = 0.0f;
  }

  float process(float x) {
    const float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

/** Removes the microphone's DC offset (about 13 Hz at 16 kHz) for the level reading. */
struct DcBlocker {
  float r = 0.995f;
  float x1 = 0, y1 = 0;
  float process(float x) {
    const float y = x - x1 + r * y1;
    x1 = x;
    y1 = y;
    return y;
  }
};

/** Mean square -> dB; zero -> -infinity. */
inline float msToDb(float meanSquare) {
  return meanSquare > 0.0f ? 10.0f * log10f(meanSquare) : -INFINITY;
}

struct AnalyzerConfig {
  float sampleRate = 16000.0f;
  /** One message per window. The web expects 20–50 ms and marks data stale after 300 ms. */
  float windowMs = 25.0f;
  /** The band both channels are measured in (Nasometer-style: about 500 Hz wide 300 Hz). Must be the same for both. */
  float bandCenterHz = 500.0f;
  float bandWidthHz = 300.0f;
  /** A raw sample at this share of full scale or more = clipped. */
  float clipFraction = 0.999f;
};

struct WindowResult {
  float nasalPercent = 0;
  /** dBFS, broadband; -infinity when the channel sent only zeros (dead) */
  float nasalDb = -INFINITY;
  float oralDb = -INFINITY;
  /** Both channels' band energy together, dBFS — what the speech gate listens to. */
  float bandDb = -INFINITY;
  bool clip = false;
  bool nasalDead = true;
  bool oralDead = true;
};

/** Collects samples of both channels and closes one window every `windowMs`. */
class Analyzer {
 public:
  void begin(const AnalyzerConfig& c) {
    const float q = c.bandCenterHz / c.bandWidthHz;
    bandN_.bandPass(c.sampleRate, c.bandCenterHz, q);
    bandO_.bandPass(c.sampleRate, c.bandCenterHz, q);
    dcN_ = DcBlocker{};
    dcO_ = DcBlocker{};
    windowFrames_ = (int)lroundf(c.sampleRate * c.windowMs / 1000.0f);
    if (windowFrames_ < 1) windowFrames_ = 1;
    clipLevel_ = (int32_t)(c.clipFraction * kFullScale);
    clear();
  }

  int windowFrames() const { return windowFrames_; }

  /** One stereo frame of 24-bit samples. Returns true when a window has just finished (read it with result()). */
  bool push(int32_t nasal, int32_t oral) {
    if (nasal != 0) anyN_ = true;
    if (oral != 0) anyO_ = true;
    if (nasal >= clipLevel_ || nasal <= -clipLevel_ || oral >= clipLevel_ || oral <= -clipLevel_) clip_ = true;

    // multiply, not divide: the ESP32-C3 has no FPU and this runs 32,000 times a second
    const float xn = (float)nasal * kInvFullScale;
    const float xo = (float)oral * kInvFullScale;
    const float bn = bandN_.process(xn);
    const float bo = bandO_.process(xo);
    const float wn = dcN_.process(xn);
    const float wo = dcO_.process(xo);
    bandSqN_ += bn * bn;
    bandSqO_ += bo * bo;
    wideSqN_ += wn * wn;
    wideSqO_ += wo * wo;

    if (++count_ < windowFrames_) return false;
    finish();
    return true;
  }

  const WindowResult& result() const { return result_; }

 private:
  void finish() {
    const float n = (float)count_;
    const float msN = bandSqN_ / n;
    const float msO = bandSqO_ / n;
    const float aN = sqrtf(msN);
    const float aO = sqrtf(msO);
    WindowResult r;
    r.nasalPercent = (aN + aO) > 0.0f ? 100.0f * aN / (aN + aO) : 0.0f;
    if (!isfinite(r.nasalPercent)) r.nasalPercent = 0.0f;
    r.bandDb = msToDb(msN + msO);
    r.nasalDead = !anyN_;
    r.oralDead = !anyO_;
    r.nasalDb = r.nasalDead ? -INFINITY : fmaxf(msToDb(wideSqN_ / n), kFloorDb);
    r.oralDb = r.oralDead ? -INFINITY : fmaxf(msToDb(wideSqO_ / n), kFloorDb);
    r.clip = clip_;
    result_ = r;
    clear();
  }

  void clear() {
    count_ = 0;
    bandSqN_ = bandSqO_ = wideSqN_ = wideSqO_ = 0.0f;
    anyN_ = anyO_ = false;
    clip_ = false;
  }

  Biquad bandN_, bandO_;
  DcBlocker dcN_, dcO_;
  int windowFrames_ = 400;
  int32_t clipLevel_ = 8380000;
  int count_ = 0;
  float bandSqN_ = 0, bandSqO_ = 0, wideSqN_ = 0, wideSqO_ = 0;
  bool anyN_ = false, anyO_ = false, clip_ = false;
  WindowResult result_;
};

struct GateConfig {
  /** Speech starts when the band level is this far above the noise floor… */
  float onAboveFloorDb = 10.0f;
  /** …and keeps going while it stays this far above it. */
  float holdAboveFloorDb = 6.0f;
  /** Never speech below this level, however quiet the room (digital near-silence, a dead line). */
  float minSpeechDb = -75.0f;
  /** Speech ends this long after the level drops (short pauses inside a word do not split it). */
  float hangoverMs = 150.0f;
  /** First moments after boot: only learn the room, never report speech. */
  float warmupMs = 500.0f;
  /** The floor follows quiet dips at once and creeps up slowly: fast in silence, very slowly during speech… */
  float floorRiseQuietDbPerSec = 4.0f;
  float floorRiseSpeechDbPerSec = 0.5f;
  /** …but a "speech" that has gone on this long without a break rises at the quiet rate, so a fan that turns on
   *  stops counting as speech a few seconds later instead of after half a minute. */
  float slowRiseMaxMs = 8000.0f;
  /** Share of the gap closed per window when the level falls below the floor. */
  float floorFall = 0.3f;
};

/** Decides speechDetected per window from the band level, against a noise floor it learns by itself. */
class SpeechGate {
 public:
  void begin(const GateConfig& c, float windowMs) {
    cfg_ = c;
    hangWindows_ = (int)lroundf(c.hangoverMs / windowMs);
    if (hangWindows_ < 1) hangWindows_ = 1;
    warmupWindows_ = (int)lroundf(c.warmupMs / windowMs);
    riseQuiet_ = c.floorRiseQuietDbPerSec * windowMs / 1000.0f;
    riseSpeech_ = c.floorRiseSpeechDbPerSec * windowMs / 1000.0f;
    slowRiseWindows_ = (int)lroundf(c.slowRiseMaxMs / windowMs);
    seen_ = 0;
    floor_ = kFloorDb;
    speaking_ = false;
    hang_ = 0;
    speechWindows_ = 0;
  }

  /**
   * One window's band level. `usable` = both channels sent sound (no dead mic). An all-zero window (-infinity:
   * the INMP441's first ~250 ms, a loose SD wire) or a dead channel says nothing about the room: it is never
   * speech and never moves the floor — learning a -150 dB floor from it made steady room noise "speech" for minutes.
   */
  bool update(float levelDb, bool usable = true) {
    if (!usable || !isfinite(levelDb)) {
      speaking_ = false;
      hang_ = 0;
      speechWindows_ = 0;
      return false;
    }
    const float level = fmaxf(levelDb, kFloorDb);

    if (seen_ < warmupWindows_) {
      floor_ = (seen_ == 0) ? level : fminf(floor_, level);
      ++seen_;
      return false;
    }

    if (!speaking_) {
      if (level >= floor_ + cfg_.onAboveFloorDb && level >= cfg_.minSpeechDb) {
        speaking_ = true;
        hang_ = hangWindows_;
      }
    } else if (level >= floor_ + cfg_.holdAboveFloorDb && level >= cfg_.minSpeechDb) {
      hang_ = hangWindows_;
    } else if (--hang_ <= 0) {
      speaking_ = false;
    }
    speechWindows_ = speaking_ ? speechWindows_ + 1 : 0;

    const bool slow = speaking_ && speechWindows_ < slowRiseWindows_;
    if (level < floor_) floor_ += (level - floor_) * cfg_.floorFall;
    else floor_ += fminf(level - floor_, slow ? riseSpeech_ : riseQuiet_);
    return speaking_;
  }

  float floorDb() const { return floor_; }
  bool speaking() const { return speaking_; }

 private:
  GateConfig cfg_;
  int hangWindows_ = 6;
  int warmupWindows_ = 20;
  float riseQuiet_ = 0.1f;
  float riseSpeech_ = 0.0125f;
  int slowRiseWindows_ = 320;
  int seen_ = 0;
  float floor_ = kFloorDb;
  bool speaking_ = false;
  int hang_ = 0;
  int speechWindows_ = 0;
};

inline void formatDb(char* out, size_t n, float db) {
  if (isfinite(db)) snprintf(out, n, "%.1f", (double)db);
  else snprintf(out, n, "null");
}

/** One WebSocket text frame, e.g. {"nasalPercent":31.5,"speechDetected":true,"nasalDb":-30.2,"oralDb":-22.0,"clip":false} */
inline int formatJson(char* out, size_t n, const WindowResult& r, bool speech) {
  char nasalDb[16];
  char oralDb[16];
  formatDb(nasalDb, sizeof nasalDb, r.nasalDb);
  formatDb(oralDb, sizeof oralDb, r.oralDb);
  const float pct = isfinite(r.nasalPercent) ? r.nasalPercent : 0.0f;  // "nan" would not parse as JSON
  return snprintf(out, n, "{\"nasalPercent\":%.1f,\"speechDetected\":%s,\"nasalDb\":%s,\"oralDb\":%s,\"clip\":%s}",
                  (double)pct, speech ? "true" : "false", nasalDb, oralDb, r.clip ? "true" : "false");
}

}  // namespace pakkeng
