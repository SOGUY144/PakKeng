// Host tests for the firmware's signal math (no board needed).
//   g++ -std=c++17 -O2 -Wall -Wextra -o firmware/test/test_nasal_dsp firmware/test/test_nasal_dsp.cpp && firmware/test/test_nasal_dsp
// Covers what the web relies on (docs/DEVICE_PROTOCOL.md): the same band filter on both channels, nasalPercent from
// band RMS, dBFS per channel with null for a dead channel, clip, the speech gate and the exact JSON text.

#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>

#include "../pakkeng_esp32/nasal_dsp.h"

using namespace pakkeng;

static int failures = 0;
static int checks = 0;

#define CHECK(cond)                                                          \
  do {                                                                       \
    ++checks;                                                                \
    if (!(cond)) {                                                           \
      ++failures;                                                            \
      std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond);           \
    }                                                                        \
  } while (0)

#define CHECK_NEAR(a, b, tol)                                                \
  do {                                                                       \
    ++checks;                                                                \
    const double va = (a), vb = (b);                                         \
    if (!(std::fabs(va - vb) <= (tol))) {                                    \
      ++failures;                                                            \
      std::printf("FAIL %s:%d  %s = %.4f, expected %.4f (+-%.4f)\n",        \
                  __FILE__, __LINE__, #a, va, vb, (double)(tol));            \
    }                                                                        \
  } while (0)

constexpr float kFs = 16000.0f;
constexpr double kTwoPi = 6.283185307179586;

// A 24-bit sample of a sine at `amp` (fraction of full scale).
static int32_t sine(double amp, double hz, int n) {
  return (int32_t)std::lround(amp * kFullScale * std::sin(kTwoPi * hz * n / kFs));
}

static AnalyzerConfig cfg() {
  AnalyzerConfig c;
  c.sampleRate = kFs;
  c.windowMs = 25;
  return c;
}

// Feed whole windows of two sines; returns the last finished window.
static WindowResult runSines(Analyzer& a, double nasalAmp, double oralAmp, double hz, int windows, int& n) {
  WindowResult last{};
  int done = 0;
  while (done < windows) {
    if (a.push(sine(nasalAmp, hz, n), sine(oralAmp, hz, n))) {
      last = a.result();
      ++done;
    }
    ++n;
  }
  return last;
}

static double bandGainDb(double hz) {
  Analyzer a;
  a.begin(cfg());
  int n = 0;
  const WindowResult r = runSines(a, 0.25, 0.25, hz, 40, n);  // 1 s: the filter has settled
  // band level of a 0.25 FS sine on both channels with unity gain: mean square 2 * 0.25^2 / 2
  const double ref = 10.0 * std::log10(2.0 * 0.25 * 0.25 / 2.0);
  return r.bandDb - ref;
}

static void testWindowLength() {
  Analyzer a;
  a.begin(cfg());
  int finished = 0;
  for (int i = 0; i < 4000; ++i)
    if (a.push(0, 0)) ++finished;
  CHECK(a.windowFrames() == 400);  // 25 ms at 16 kHz
  CHECK(finished == 10);
}

static void testBandFilter() {
  CHECK_NEAR(bandGainDb(500), 0.0, 0.5);  // centre of the band passes unchanged
  CHECK(bandGainDb(100) < -12.0);         // low rumble is cut
  CHECK(bandGainDb(4000) < -12.0);        // hiss and sibilants are cut
}

static void testNasalPercentFromBandRms() {
  Analyzer a;
  a.begin(cfg());
  int n = 0;
  WindowResult r = runSines(a, 0.10, 0.30, 500, 20, n);
  CHECK_NEAR(r.nasalPercent, 25.0, 0.5);  // 100 * 0.10 / (0.10 + 0.30)
  CHECK(!r.nasalDead && !r.oralDead);
  CHECK(!r.clip);

  // Same ratio, louder: the percentage does not depend on loudness.
  Analyzer b;
  b.begin(cfg());
  n = 0;
  r = runSines(b, 0.20, 0.60, 500, 20, n);
  CHECK_NEAR(r.nasalPercent, 25.0, 0.5);
}

static void testChannelLevelsInDbfs() {
  Analyzer a;
  a.begin(cfg());
  int n = 0;
  const WindowResult r = runSines(a, 0.5, 0.05, 1000, 20, n);
  // A sine's RMS is amp / sqrt(2): 0.5 -> -9.03 dBFS, 0.05 -> -29.03 dBFS (broadband, DC removed)
  CHECK_NEAR(r.nasalDb, -9.03, 0.3);
  CHECK_NEAR(r.oralDb, -29.03, 0.3);
}

static void testDeadChannelIsDigitalSilence() {
  Analyzer a;
  a.begin(cfg());
  WindowResult r{};
  for (int n = 0; n < 4000; ++n)
    if (a.push(sine(0.1, 500, n), 0)) r = a.result();
  CHECK(r.oralDead);
  CHECK(!r.nasalDead);
  CHECK(std::isinf(r.oralDb) && r.oralDb < 0);

  char buf[200];
  formatJson(buf, sizeof buf, r, false);
  CHECK(std::strstr(buf, "\"oralDb\":null") != nullptr);
}

static void testClip() {
  Analyzer a;
  a.begin(cfg());
  WindowResult r{};
  bool got = false;
  for (int n = 0; n < 400 && !got; ++n) {
    const int32_t v = (n == 100) ? 8388607 : sine(0.1, 500, n);
    if (a.push(v, sine(0.1, 500, n))) {
      r = a.result();
      got = true;
    }
  }
  CHECK(got);
  CHECK(r.clip);

  // The next window has no full-scale sample: clip is per window.
  int n = 400;
  r = runSines(a, 0.1, 0.1, 500, 1, n);
  CHECK(!r.clip);
}

// Drive the gate with whole windows at a given band level.
static bool feed(SpeechGate& g, float db, int windows) {
  bool s = false;
  for (int i = 0; i < windows; ++i) s = g.update(db);
  return s;
}

static void testSpeechGate() {
  GateConfig gc;
  SpeechGate g;
  g.begin(gc, 25);
  CHECK(!feed(g, -70.0f, 40));       // a quiet room: learn the noise floor, no speech
  CHECK_NEAR(g.floorDb(), -70.0, 1.0);
  CHECK(g.update(-35.0f));           // speech starts on the first loud window
  CHECK(feed(g, -36.0f, 80));        // and holds through 2 s of talking
  // stops after the hangover (150 ms = 6 windows at 25 ms), not at once
  CHECK(feed(g, -70.0f, 5));
  CHECK(!feed(g, -70.0f, 2));
}

static void testGateIgnoresTinyLevels() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -130.0f, 40);  // digital near-silence
  CHECK(!feed(g, -100.0f, 10));  // 30 dB above the floor but below the absolute minimum: not speech
}

static void testGateRecoversWhenStartedDuringSpeech() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -30.0f, 40);  // someone was talking while the board booted: the floor starts too high
  feed(g, -70.0f, 40);  // the room goes quiet: the floor falls to the real noise
  CHECK(g.floorDb() < -65.0f);
  CHECK(g.update(-35.0f));
}

static void testGateNotStuckAfterTheRoomGetsLouder() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -70.0f, 40);
  feed(g, -50.0f, 40 * 60);  // a fan turns on and stays on for a minute
  CHECK(!g.update(-50.0f));  // the floor has caught up: steady noise is not speech
}

// The INMP441 sends zeros for its first ~250 ms, and a loose SD wire sends zeros too. An all-zero window says
// nothing about the room: it must not teach the gate a -150 dB floor (that made steady room noise "speech" for minutes).
static void testGateIgnoresZeroWindowsAtBoot() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  CHECK(!feed(g, -INFINITY, 10));
  CHECK(!feed(g, -60.0f, 40));  // a fan-noisy room after the mic wakes up
  CHECK_NEAR(g.floorDb(), -60.0, 1.0);
  CHECK(!feed(g, -60.0f, 40));
  CHECK(g.update(-30.0f));  // a real voice still starts speech
}

static void testGateIgnoresOneZeroWindowMidRun() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -60.0f, 40);
  CHECK(!g.update(-INFINITY));
  CHECK(!feed(g, -60.0f, 4));  // the floor did not drop, so the room is not suddenly "speech"
  CHECK_NEAR(g.floorDb(), -60.0, 1.0);
}

static void testGateDeadChannelIsNotSpeech() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -70.0f, 40);
  CHECK(!g.update(-30.0f, false));  // loud, but one mic is missing: the web cannot use this window
  CHECK_NEAR(g.floorDb(), -70.0, 1.0);
  CHECK(g.update(-30.0f));
}

static void testGateLongSteadySoundEnds() {
  SpeechGate g;
  g.begin(GateConfig{}, 25);
  feed(g, -70.0f, 40);
  CHECK(feed(g, -50.0f, 40 * 6));    // 6 s of one long sound still counts (a long vowel)
  CHECK(!feed(g, -50.0f, 40 * 9));   // but a steady sound is learned as room noise soon after 8 s
}

static void testJsonText() {
  WindowResult r{};
  r.nasalPercent = 31.54f;
  r.nasalDb = -30.21f;
  r.oralDb = -22.04f;
  r.clip = false;
  char buf[200];
  const int len = formatJson(buf, sizeof buf, r, true);
  CHECK(std::string(buf) ==
        "{\"nasalPercent\":31.5,\"speechDetected\":true,\"nasalDb\":-30.2,\"oralDb\":-22.0,\"clip\":false}");
  CHECK(len == (int)std::strlen(buf));

  r.nasalDb = -INFINITY;
  r.oralDb = -INFINITY;
  r.nasalPercent = 0;
  r.clip = true;
  formatJson(buf, sizeof buf, r, false);
  CHECK(std::string(buf) ==
        "{\"nasalPercent\":0.0,\"speechDetected\":false,\"nasalDb\":null,\"oralDb\":null,\"clip\":true}");
}

// A NaN would print as "nan", which JSON.parse rejects: the web would just see stale data.
static void testJsonNeverPrintsNan() {
  WindowResult r{};
  r.nasalPercent = NAN;
  r.nasalDb = NAN;
  r.oralDb = -20.0f;
  char buf[200];
  formatJson(buf, sizeof buf, r, false);
  CHECK(std::strstr(buf, "nan") == nullptr);
  CHECK(std::strstr(buf, "\"nasalPercent\":0.0") != nullptr);
}

int main() {
  testWindowLength();
  testBandFilter();
  testNasalPercentFromBandRms();
  testChannelLevelsInDbfs();
  testDeadChannelIsDigitalSilence();
  testClip();
  testSpeechGate();
  testGateIgnoresTinyLevels();
  testGateRecoversWhenStartedDuringSpeech();
  testGateNotStuckAfterTheRoomGetsLouder();
  testGateIgnoresZeroWindowsAtBoot();
  testGateIgnoresOneZeroWindowMidRun();
  testGateDeadChannelIsNotSpeech();
  testGateLongSteadySoundEnds();
  testJsonText();
  testJsonNeverPrintsNan();
  std::printf("%d/%d checks passed\n", checks - failures, checks);
  return failures == 0 ? 0 : 1;
}
