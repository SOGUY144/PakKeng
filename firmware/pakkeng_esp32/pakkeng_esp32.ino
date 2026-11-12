/*
  PakKeng — เฟิร์มแวร์ ESP32 + ไมค์ INMP441 สองตัว ส่งค่าเสียงจมูก/เสียงปากไปที่เว็บผ่าน WebSocket

  ทำอะไร
    อ่านไมค์ทั้งสองตัวจากบัส I2S เดียวกัน (16 kHz) ทุก 25 ms คำนวณ nasalPercent, speechDetected,
    nasalDb, oralDb, clip แล้วส่งเป็น JSON ให้ทุกเว็บที่ต่ออยู่ที่ ws://<IP ของบอร์ด>:81
    รูปแบบข้อมูล: docs/DEVICE_PROTOCOL.md · การคำนวณ: nasal_dsp.h (มีเทสต์ใน firmware/test)

  ต้องมี
    - Arduino IDE 2 (หรือ arduino-cli) + บอร์ด "esp32 by Espressif Systems" เวอร์ชัน 3.x
    - ไลบรารี "WebSockets" by Markus Sattler (Library Manager)
    วิธีต่อสายและอัปโหลดทีละขั้น: firmware/README.md

  ต้นแบบ: ยังไม่ได้ทดสอบกับบอร์ดและแผ่นกั้นจริง ไม่ใช่เครื่องมือวินิจฉัย ค่าเกณฑ์ทั้งหมดต้องวัดใหม่กับอุปกรณ์จริง
*/

#include <Arduino.h>

#if !defined(ESP_ARDUINO_VERSION_MAJOR) || ESP_ARDUINO_VERSION_MAJOR < 3
#error "ต้องใช้บอร์ด esp32 by Espressif Systems เวอร์ชัน 3.x ขึ้นไป (Tools > Board > Boards Manager)"
#endif

#include <ESPmDNS.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#include <driver/i2s_std.h>

#include "nasal_dsp.h"

// ======================= ตั้งค่า (แก้ตรงนี้) =======================

// Wi-Fi บ้าน: ใส่ชื่อและรหัสเพื่อให้บอร์ดเข้าวงเดียวกับคอม/มือถือ
// เว้นว่างไว้ = บอร์ดเปิด Wi-Fi ของตัวเอง (โหมด Access Point) ที่ 192.168.4.1
// ต่อวง Wi-Fi บ้านไม่ได้ภายใน 15 วินาที = เปิด Wi-Fi ของตัวเองแทน
// ใส่ชื่อ/รหัสในไฟล์ wifi_secrets.h ข้างไฟล์นี้ (ไม่ขึ้น git) แทนการพิมพ์รหัสลงไฟล์นี้:
//   #define PAKKENG_WIFI_SSID "ชื่อ Wi-Fi"
//   #define PAKKENG_WIFI_PASSWORD "รหัส"
#if __has_include("wifi_secrets.h")
#include "wifi_secrets.h"
#endif
#ifndef PAKKENG_WIFI_SSID
#define PAKKENG_WIFI_SSID ""
#define PAKKENG_WIFI_PASSWORD ""
#endif
static const char* WIFI_SSID = PAKKENG_WIFI_SSID;
static const char* WIFI_PASSWORD = PAKKENG_WIFI_PASSWORD;

// Wi-Fi ของบอร์ดเอง (ชื่อจะเป็น PakKeng-XXXX) — รหัสอย่างน้อย 8 ตัว ควรเปลี่ยนก่อนใช้จริง
static const char* AP_PASSWORD = "pakkeng123";

// ชื่อในวง Wi-Fi: ws://pakkeng.local:81 (ใช้ได้บน iPhone/Mac/Windows ส่วน Android ให้ใช้เลข IP)
static const char* HOSTNAME = "pakkeng";

// ไมค์แต่ละตัวมีสาย SCK/WS/SD ของตัวเอง (สองบัส I2S แยกกัน) = true
// ไมค์สองตัวใช้สาย SCK/WS/SD ร่วมกัน ต่างกันแค่ขา L/R (บัสเดียว) = false
// สองบัสใช้ได้กับ ESP32 รุ่นธรรมดาและ ESP32-S3 (มี I2S สองชุด) ส่วน ESP32-C3 มีชุดเดียว
#if CONFIG_IDF_TARGET_ESP32C3
#define TWO_BUSES 0
#else
#define TWO_BUSES 1  // 0 = บัสเดียว
#endif

#if TWO_BUSES
// ขาของบอร์ดทีมเรา (ESP32 DevKit) — แก้ให้ตรงกับที่ต่อจริง
// ไมค์จมูก (บน) = ไมค์ตัวแรก · ไมค์ปาก (ล่าง) = ไมค์ตัวที่สอง
// ขา L/R ของแต่ละตัวต่อ GND หรือ 3V3 ก็ได้ (ห้ามลอย) เฟิร์มแวร์หาช่องที่มีข้อมูลเอง
static const int PIN_NASAL_SCK = 21;
static const int PIN_NASAL_WS = 19;
static const int PIN_NASAL_SD = 22;
static const int PIN_ORAL_SCK = 16;
static const int PIN_ORAL_WS = 17;
static const int PIN_ORAL_SD = 23;
#endif

// ขา I2S แบบบัสเดียว (ใช้เมื่อ TWO_BUSES = 0) — แก้ให้ตรงกับที่ต่อจริง
#if CONFIG_IDF_TARGET_ESP32S3
static const int PIN_I2S_SCK = 5;
static const int PIN_I2S_WS = 4;
static const int PIN_I2S_SD = 6;
#elif CONFIG_IDF_TARGET_ESP32C3
static const int PIN_I2S_SCK = 4;
static const int PIN_I2S_WS = 5;
static const int PIN_I2S_SD = 6;
#else  // ESP32 DevKit ทั่วไป
static const int PIN_I2S_SCK = 33;
static const int PIN_I2S_WS = 25;
static const int PIN_I2S_SD = 32;
#endif

// บัสเดียว: ไมค์จมูก (บน) = ช่องซ้าย: ขา L/R ต่อ GND · ไมค์ปาก (ล่าง) = ช่องขวา: ขา L/R ต่อ 3V3
// สองบัส: สลับว่าไมค์ตัวไหนเป็นจมูก/ปาก
// ถ้าเคาะไมค์บนแล้วค่า oralDb ขยับแทน nasalDb ให้เปลี่ยนเป็น true
static const bool SWAP_CHANNELS = false;

// พิมพ์ค่าทาง Serial ทุก 100 ms สำหรับ Tools > Serial Plotter (115200)
// พิมพ์อะไรก็ได้ใน Serial Monitor แล้วกด Enter = แสดงที่อยู่ของบอร์ดอีกครั้ง
static const bool SERIAL_PLOT = true;

// ไฟบอกว่าได้ยินเสียงพูด: -1 = ไม่ใช้ · บอร์ดที่ไฟติดเมื่อขาเป็น LOW (เช่น ESP32-C3 SuperMini ขา 8) ให้ตั้ง LED_ACTIVE_LOW = true
#ifdef LED_BUILTIN
static const int LED_PIN = LED_BUILTIN;
#else
static const int LED_PIN = -1;
#endif
static const bool LED_ACTIVE_LOW = false;

static const uint32_t SAMPLE_RATE = 16000;
static const uint16_t WS_PORT = 81;

// ======================= ส่วนทำงาน =======================

static const char* FIRMWARE_VERSION = "0.1.0";
static const size_t FRAMES_PER_READ = 256;  // 16 ms ต่อครั้งที่อ่าน

static i2s_chan_handle_t rxChan = nullptr;
static int32_t i2sBuf[FRAMES_PER_READ * 2];
#if TWO_BUSES
static i2s_chan_handle_t rxChan2 = nullptr;
static int32_t i2sBuf2[FRAMES_PER_READ * 2];
// ช่อง (0 = ซ้าย, 1 = ขวา) ที่ไมค์แต่ละตัวส่งข้อมูลมา ตามขา L/R · -1 = ยังไม่รู้
static int8_t slotNasal = -1;
static int8_t slotOral = -1;
#endif

static pakkeng::Analyzer analyzer;
static pakkeng::SpeechGate gate;
static pakkeng::AnalyzerConfig analyzerCfg;

static WebSocketsServer ws(WS_PORT);
static WebServer http(80);

static char lastJson[160] = "{}";
static pakkeng::WindowResult lastResult;
static bool lastSpeech = false;
static uint32_t windowsSent = 0;
static uint32_t i2sErrors = 0;
static bool stationMode = false;
static char apName[24];
static IPAddress deviceIp;

// เปิด I2S หนึ่งชุดเป็นตัวรับสองช่อง (INMP441: ข้อมูล 24 บิตในช่อง 32 บิต รูปแบบ Philips)
static i2s_chan_handle_t openBus(i2s_port_t port, int sck, int ws, int sd) {
  i2s_chan_handle_t h = nullptr;
  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(port, I2S_ROLE_MASTER);
  chanCfg.dma_desc_num = 8;
  chanCfg.dma_frame_num = 256;  // บัฟเฟอร์รวมราว 128 ms กันเสียงหายตอน Wi-Fi ช้า
  ESP_ERROR_CHECK(i2s_new_channel(&chanCfg, nullptr, &h));
  i2s_std_config_t stdCfg = {
      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),
      .gpio_cfg =
          {
              .mclk = I2S_GPIO_UNUSED,
              .bclk = (gpio_num_t)sck,
              .ws = (gpio_num_t)ws,
              .dout = I2S_GPIO_UNUSED,
              .din = (gpio_num_t)sd,
              .invert_flags = {.mclk_inv = false, .bclk_inv = false, .ws_inv = false},
          },
  };
  ESP_ERROR_CHECK(i2s_channel_init_std_mode(h, &stdCfg));
  // ไมค์ที่หลุด/ไม่ได้ต่อ อ่านได้ 0 ล้วน -> เว็บเห็นเป็น "ช่องไมค์หาย" แทนค่าขยะ
  gpio_pulldown_en((gpio_num_t)sd);
  ESP_ERROR_CHECK(i2s_channel_enable(h));
  return h;
}

static void startI2S() {
#if TWO_BUSES
  rxChan = openBus(I2S_NUM_0, PIN_NASAL_SCK, PIN_NASAL_WS, PIN_NASAL_SD);
  rxChan2 = openBus(I2S_NUM_1, PIN_ORAL_SCK, PIN_ORAL_WS, PIN_ORAL_SD);
  return;
#endif
  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  chanCfg.dma_desc_num = 8;
  chanCfg.dma_frame_num = 256;  // บัฟเฟอร์รวมราว 128 ms กันเสียงหายตอน Wi-Fi ช้า
  ESP_ERROR_CHECK(i2s_new_channel(&chanCfg, nullptr, &rxChan));

  i2s_std_config_t stdCfg = {
      .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
      // INMP441: ข้อมูล 24 บิตในช่อง 32 บิต รูปแบบ Philips สองช่อง (ซ้าย = L/R ต่อ GND)
      .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),
      .gpio_cfg =
          {
              .mclk = I2S_GPIO_UNUSED,
              .bclk = (gpio_num_t)PIN_I2S_SCK,
              .ws = (gpio_num_t)PIN_I2S_WS,
              .dout = I2S_GPIO_UNUSED,
              .din = (gpio_num_t)PIN_I2S_SD,
              .invert_flags =
                  {
                      .mclk_inv = false,
                      .bclk_inv = false,
                      .ws_inv = false,
                  },
          },
  };
  ESP_ERROR_CHECK(i2s_channel_init_std_mode(rxChan, &stdCfg));
  // ไมค์ที่หลุด/ไม่ได้ต่อ ทำให้ช่องของมันอ่านได้ 0 ล้วน -> เว็บเห็นเป็น "ช่องไมค์หาย" แทนค่าขยะ
  gpio_pulldown_en((gpio_num_t)PIN_I2S_SD);
  ESP_ERROR_CHECK(i2s_channel_enable(rxChan));
}

static void startWiFi() {
  WiFi.persistent(false);
  const uint64_t chip = ESP.getEfuseMac();
  snprintf(apName, sizeof apName, "PakKeng-%04X", (unsigned)((chip >> 32) & 0xFFFF));

  WiFi.setHostname(HOSTNAME);  // ก่อน WiFi.mode() ชื่อจึงขึ้นในเราเตอร์
  if (strlen(WIFI_SSID) > 0) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.printf("[wifi] กำลังต่อ \"%s\"", WIFI_SSID);
    const uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
      delay(250);
      Serial.print('.');
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
      stationMode = true;
      WiFi.setAutoReconnect(true);
      deviceIp = WiFi.localIP();
    } else {
      Serial.println("[wifi] ต่อไม่ได้ เปิด Wi-Fi ของบอร์ดเองแทน");
      WiFi.disconnect(true);
    }
  }

  if (!stationMode) {
    WiFi.mode(WIFI_AP);
    if (!WiFi.softAP(apName, AP_PASSWORD)) {
      Serial.println("[wifi] เปิด Wi-Fi ของบอร์ดไม่ได้ — AP_PASSWORD ต้องยาวอย่างน้อย 8 ตัว");
    }
    deviceIp = WiFi.softAPIP();
  }
  WiFi.setSleep(false);  // ส่งค่าทุก 25 ms: ปิดโหมดประหยัดไฟของ Wi-Fi เพื่อลดหน่วง

  if (MDNS.begin(HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    MDNS.addService("ws", "tcp", WS_PORT);
  }
}

static void printConnectInfo() {
  Serial.println();
  Serial.println("========== PakKeng ESP32 ==========");
  if (stationMode) {
    Serial.printf("Wi-Fi บ้าน: %s\n", WIFI_SSID);
  } else {
    Serial.printf("Wi-Fi ของบอร์ด: %s  รหัส: %s\n", apName, AP_PASSWORD);
  }
  Serial.printf("ใส่ในเว็บ (ในเกม: สำหรับผู้ดูแล > แหล่งสัญญาณ): ws://%s:%u\n", deviceIp.toString().c_str(), WS_PORT);
  Serial.printf("หรือ ws://%s.local:%u\n", HOSTNAME, WS_PORT);
  Serial.printf("หน้าเช็กสถานะ: http://%s/\n", deviceIp.toString().c_str());
#if TWO_BUSES
  Serial.printf("ไมค์จมูก: SCK=%d WS=%d SD=%d · ไมค์ปาก: SCK=%d WS=%d SD=%d%s\n", PIN_NASAL_SCK, PIN_NASAL_WS,
                PIN_NASAL_SD, PIN_ORAL_SCK, PIN_ORAL_WS, PIN_ORAL_SD, SWAP_CHANNELS ? " (สลับจมูก/ปาก)" : "");
#else
  Serial.printf("ขา I2S: SCK=%d WS=%d SD=%d · ไมค์จมูก=ช่อง%s\n", PIN_I2S_SCK, PIN_I2S_WS, PIN_I2S_SD,
                SWAP_CHANNELS ? "ขวา" : "ซ้าย");
#endif
  Serial.println("==================================");
}

static void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  (void)payload;
  (void)length;
  if (type == WStype_CONNECTED) {
    Serial.printf("[ws] เว็บต่อเข้ามา #%u (ทั้งหมด %d)\n", num, ws.connectedClients());
  } else if (type == WStype_DISCONNECTED) {
    Serial.printf("[ws] เว็บหลุด #%u\n", num);
  }
}

static const char* dbText(float db, char* buf, size_t n) {
  if (isfinite(db)) snprintf(buf, n, "%.1f dBFS", (double)db);
  else snprintf(buf, n, "ไม่มีสัญญาณ (ตรวจสาย/ขา L/R)");
  return buf;
}

// หน้าเช็กสถานะเล็ก ๆ: เปิด http://<IP>/ จากมือถือเพื่อดูว่าไมค์ส่งค่าอยู่ไหม (รีเฟรชเองทุกวินาที)
static void handleRoot() {
  char nasal[48];
  char oral[48];
  String html;
  html.reserve(1400);
  html += F("<!doctype html><html lang=th><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            "<meta http-equiv=refresh content=1><title>PakKeng ESP32</title>"
            "<style>body{font-family:system-ui,sans-serif;margin:24px;color:#221f3b;background:#f6f4fe}"
            "h1{font-size:20px}td{padding:4px 12px 4px 0}code{background:#fff;padding:2px 6px;border-radius:6px}</style>"
            "<h1>PakKeng ESP32 · ต้นแบบ</h1><table>");
  html += "<tr><td>ที่อยู่ WebSocket</td><td><code>ws://" + deviceIp.toString() + ":" + String(WS_PORT) + "</code></td></tr>";
  html += "<tr><td>Wi-Fi</td><td>" + String(stationMode ? WIFI_SSID : apName) + (stationMode ? " (บ้าน)" : " (ของบอร์ด)") + "</td></tr>";
  html += "<tr><td>เว็บที่ต่ออยู่</td><td>" + String(ws.connectedClients()) + "</td></tr>";
  html += "<tr><td>ไมค์จมูก (บน)</td><td>" + String(dbText(lastResult.nasalDb, nasal, sizeof nasal)) + "</td></tr>";
  html += "<tr><td>ไมค์ปาก (ล่าง)</td><td>" + String(dbText(lastResult.oralDb, oral, sizeof oral)) + "</td></tr>";
  html += "<tr><td>มีเสียงพูด</td><td>" + String(lastSpeech ? "ใช่" : "ไม่") + "</td></tr>";
  // ค่านี้มีความหมายเฉพาะตอนมีเสียงพูดและไมค์ครบสองตัว (ไมค์หายตัวหนึ่ง = 0% หรือ 100% ปลอม)
  const bool pctUsable = lastSpeech && !lastResult.nasalDead && !lastResult.oralDead;
  html += "<tr><td>nasalPercent</td><td>" + (pctUsable ? String(lastResult.nasalPercent, 1) : String("—")) + "</td></tr>";
  html += "<tr><td>เสียงล้น</td><td>" + String(lastResult.clip ? "ใช่ (ลดเสียง/ขยับไมค์ออก)" : "ไม่") + "</td></tr>";
  html += "<tr><td>ส่งไปแล้ว</td><td>" + String(windowsSent) + " ข้อความ</td></tr>";
  html += "<tr><td>เฟิร์มแวร์</td><td>" + String(FIRMWARE_VERSION) + "</td></tr></table>";
  html += F("<p>เครื่องมือฝึกเสริมที่บ้าน ภายใต้คำแนะนำของนักแก้ไขการพูด<br>"
            "ต้นแบบนี้ยังไม่ได้ตรวจสอบเทียบกับ Nasometer ใช้ดูแนวโน้มจากการฝึกเท่านั้น ไม่ใช้วินิจฉัย</p></html>");
  http.send(200, "text/html; charset=utf-8", html);
}

static void handleJson() {
  http.sendHeader("Access-Control-Allow-Origin", "*");
  http.send(200, "application/json", lastJson);
}

static void setLed(bool on) {
  static int8_t shown = -1;  // เขียนเฉพาะตอนเปลี่ยน (บางบอร์ดเป็นไฟ RGB ที่ส่งข้อมูลทุกครั้งที่เขียน)
  if (LED_PIN < 0 || shown == (int8_t)on) return;
  shown = (int8_t)on;
  digitalWrite(LED_PIN, (on != LED_ACTIVE_LOW) ? HIGH : LOW);
}

static void onWindow(const pakkeng::WindowResult& r) {
  // ไมค์หายตัวใดตัวหนึ่ง = หน้าต่างนี้ใช้ไม่ได้ ไม่ใช่เสียงพูด และไม่ใช้สอนระดับเสียงรบกวน
  const bool speech = gate.update(r.bandDb, !r.nasalDead && !r.oralDead);
  const int len = pakkeng::formatJson(lastJson, sizeof lastJson, r, speech);
  lastResult = r;
  lastSpeech = speech;
  if (len > 0 && len < (int)sizeof lastJson && ws.connectedClients() > 0) {
    ws.broadcastTXT(lastJson, (size_t)len);
    windowsSent++;
  }
  setLed(speech);

  // Serial Plotter: ค่าสูงสุดของ 4 หน้าต่าง (100 ms) — การเคาะไมค์สั้นกว่าหน้าต่างเดียวจึงไม่หลุดหาย
  static uint8_t plotTick = 0;
  static float peakN = -INFINITY;
  static float peakO = -INFINITY;
  static bool anySpeech = false;
  peakN = fmaxf(peakN, isfinite(r.nasalDb) ? r.nasalDb : -120.0f);
  peakO = fmaxf(peakO, isfinite(r.oralDb) ? r.oralDb : -120.0f);
  anySpeech = anySpeech || speech;
  if (++plotTick >= 4) {
    if (SERIAL_PLOT) {
      // ป้ายบอกตรง ๆ ว่าเป็นไมค์ไหน (ในเว็บ/JSON ยังชื่อ nasalDb / oralDb ตาม docs/DEVICE_PROTOCOL.md)
      // ไมค์1 = จมูก (บน) · ไมค์2 = ปาก (ล่าง) · ถ้าตั้ง SWAP_CHANNELS = true ไมค์จะสลับกัน
      Serial.printf("%s:%.1f,%s:%.1f,เปอร์เซ็นต์จมูก:%.1f,มีเสียงพูด:%d,เสียงห้อง:%.1f\n",
                    SWAP_CHANNELS ? "ไมค์2_จมูก_dB" : "ไมค์1_จมูก_dB", (double)peakN,
                    SWAP_CHANNELS ? "ไมค์1_ปาก_dB" : "ไมค์2_ปาก_dB", (double)peakO, (double)r.nasalPercent,
                    anySpeech ? 10 : 0, (double)gate.floorDb());
    }
    plotTick = 0;
    peakN = peakO = -INFINITY;
    anySpeech = false;
  }
}

#if TWO_BUSES
// เลือกช่องที่ไมค์ส่งข้อมูลมา: ช่องหนึ่งเป็น 0 ล้วนอีกช่องไม่ใช่ = รู้ทันที (ขา L/R ต่อแน่น)
// ยังไม่รู้และมีข้อมูลทั้งสองช่อง (ขา L/R ลอย) = เลือกช่องที่ดังกว่า
static void pickSlot(const int32_t* buf, size_t frames, int8_t& slot, const char* name) {
  uint64_t sum[2] = {0, 0};
  for (size_t i = 0; i < frames; ++i) {
    sum[0] += (uint64_t)llabs((long long)(buf[2 * i] >> 8));
    sum[1] += (uint64_t)llabs((long long)(buf[2 * i + 1] >> 8));
  }
  int8_t s = slot;
  if (sum[0] > 0 && sum[1] == 0) s = 0;
  else if (sum[1] > 0 && sum[0] == 0) s = 1;
  else if (slot < 0 && (sum[0] > 0 || sum[1] > 0)) s = sum[0] >= sum[1] ? 0 : 1;
  if (s != slot) {
    slot = s;
    Serial.printf("[i2s] ไมค์%s ส่งข้อมูลทางช่อง%s\n", name, s == 0 ? "ซ้าย (L/R ต่อ GND)" : "ขวา (L/R ต่อ 3V3)");
  }
}

static bool readBus(i2s_chan_handle_t h, int32_t* buf, size_t& frames) {
  size_t bytesRead = 0;
  const esp_err_t err = i2s_channel_read(h, buf, sizeof(int32_t) * FRAMES_PER_READ * 2, &bytesRead, 100);
  if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
    if (++i2sErrors % 50 == 1) Serial.printf("[i2s] อ่านไม่ได้: %s\n", esp_err_to_name(err));
    frames = 0;
    return false;
  }
  frames = bytesRead / (2 * sizeof(int32_t));
  return true;
}

static void readAudioTwoBuses() {
  size_t fa = 0, fb = 0;
  // ทั้งสองบัสเดินที่ 16 kHz: อ่านบัสแรกรอราว 16 ms ระหว่างนั้นบัสที่สองก็เก็บได้เท่ากัน
  if (!readBus(rxChan, i2sBuf, fa) || !readBus(rxChan2, i2sBuf2, fb)) return;
  pickSlot(i2sBuf, fa, slotNasal, SWAP_CHANNELS ? "ปาก" : "จมูก");
  pickSlot(i2sBuf2, fb, slotOral, SWAP_CHANNELS ? "จมูก" : "ปาก");
  const size_t frames = fa < fb ? fa : fb;
  const int sa = slotNasal < 0 ? 0 : slotNasal;
  const int sb = slotOral < 0 ? 0 : slotOral;
  for (size_t i = 0; i < frames; ++i) {
    const int32_t a = i2sBuf[2 * i + sa] >> 8;
    const int32_t b = i2sBuf2[2 * i + sb] >> 8;
    const int32_t nasal = SWAP_CHANNELS ? b : a;
    const int32_t oral = SWAP_CHANNELS ? a : b;
    if (analyzer.push(nasal, oral)) onWindow(analyzer.result());
  }
}
#endif

static void readAudio() {
#if TWO_BUSES
  readAudioTwoBuses();
  return;
#endif
  size_t bytesRead = 0;
  const esp_err_t err = i2s_channel_read(rxChan, i2sBuf, sizeof i2sBuf, &bytesRead, 100);
  if (err != ESP_OK && err != ESP_ERR_TIMEOUT) {
    if (++i2sErrors % 50 == 1) Serial.printf("[i2s] อ่านไม่ได้: %s\n", esp_err_to_name(err));
    return;
  }
  const size_t frames = bytesRead / (2 * sizeof(int32_t));
  for (size_t i = 0; i < frames; ++i) {
    // 24 บิตอยู่ด้านบนของช่อง 32 บิต: เลื่อนลง 8 บิต (เก็บเครื่องหมาย)
    const int32_t left = i2sBuf[2 * i] >> 8;
    const int32_t right = i2sBuf[2 * i + 1] >> 8;
    const int32_t nasal = SWAP_CHANNELS ? right : left;
    const int32_t oral = SWAP_CHANNELS ? left : right;
    if (analyzer.push(nasal, oral)) onWindow(analyzer.result());
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  if (LED_PIN >= 0) {
    pinMode(LED_PIN, OUTPUT);
    setLed(false);
  }

  analyzerCfg.sampleRate = (float)SAMPLE_RATE;
  analyzer.begin(analyzerCfg);
  gate.begin(pakkeng::GateConfig{}, analyzerCfg.windowMs);

  startWiFi();
  startI2S();

  ws.begin();
  ws.onEvent(onWsEvent);
  ws.enableHeartbeat(3000, 2000, 2);  // ตัดเว็บที่หายไปเงียบ ๆ (มือถือพับจอ) ภายในราว 7 วินาที

  http.on("/", handleRoot);
  http.on("/json", handleJson);
  http.begin();

  printConnectInfo();
}

void loop() {
  readAudio();  // รอเสียงราว 16 ms ต่อครั้ง
  ws.loop();
  http.handleClient();

  // เปิด Serial Monitor หลังบอร์ดบูตไปแล้ว: พิมพ์อะไรก็ได้แล้วกด Enter เพื่อดูที่อยู่อีกครั้ง
  if (Serial.available() > 0) {
    while (Serial.available() > 0) Serial.read();
    printConnectInfo();
  }
}
