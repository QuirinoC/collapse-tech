#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

namespace {
constexpr char kDeviceName[] = "iPhone Rover";
constexpr char kServiceUuid[] = "8f9a0000-4a0a-4a4a-9f6d-0f6d2b2f1000";
constexpr char kCommandUuid[] = "8f9a0001-4a0a-4a4a-9f6d-0f6d2b2f1000";
constexpr char kTelemetryUuid[] = "8f9a0002-4a0a-4a4a-9f6d-0f6d2b2f1000";

// Pin map for the Adafruit ESP32-C3 DevKitM-01 and DRV8833.
constexpr uint8_t kLeftInputOnePin = 3;
constexpr uint8_t kLeftInputTwoPin = 4;
constexpr uint8_t kRightInputOnePin = 5;
constexpr uint8_t kRightInputTwoPin = 6;
constexpr uint8_t kLeftEncoderAPin = 7;
constexpr uint8_t kLeftEncoderBPin = 8;
constexpr uint8_t kRightEncoderAPin = 9;
constexpr uint8_t kRightEncoderBPin = 10;
constexpr uint8_t kLeftBumperPin = 1;
constexpr uint8_t kRightBumperPin = 2;
constexpr uint8_t kEmergencyStopPin = 18;
constexpr uint8_t kBatteryAdcPin = 0;

constexpr uint32_t kCommandTimeoutMs = 300;
constexpr uint32_t kTelemetryPeriodMs = 100;
constexpr uint16_t kPwmMax = 255;
constexpr float kBatteryDividerRatio = 2.0f;
constexpr float kAdcReferenceVolts = 3.3f;
constexpr float kAdcMax = 4095.0f;

volatile int32_t leftTicks = 0;
volatile int32_t rightTicks = 0;
volatile bool emergencyStopLatched = false;
uint32_t lastCommandMs = 0;
uint32_t lastTelemetryMs = 0;
uint32_t lastCommandSequence = 0;
int16_t leftCommand = 0;
int16_t rightCommand = 0;

BLECharacteristic* telemetryCharacteristic = nullptr;

void IRAM_ATTR onLeftEncoder() {
  leftTicks += digitalRead(kLeftEncoderBPin) ? 1 : -1;
}

void IRAM_ATTR onRightEncoder() {
  rightTicks += digitalRead(kRightEncoderBPin) ? 1 : -1;
}

void IRAM_ATTR onEmergencyStop() {
  emergencyStopLatched = true;
}

int16_t clampCommand(int value) {
  return static_cast<int16_t>(constrain(value, -1000, 1000));
}

void writeMotor(uint8_t inputOnePin, uint8_t inputTwoPin, int16_t command) {
  const uint16_t magnitude = static_cast<uint16_t>(
      map(abs(command), 0, 1000, 0, kPwmMax));
  if (command >= 0) {
    analogWrite(inputOnePin, magnitude);
    analogWrite(inputTwoPin, 0);
  } else {
    analogWrite(inputOnePin, 0);
    analogWrite(inputTwoPin, magnitude);
  }
}

void stopMotors() {
  analogWrite(kLeftInputOnePin, 0);
  analogWrite(kLeftInputTwoPin, 0);
  analogWrite(kRightInputOnePin, 0);
  analogWrite(kRightInputTwoPin, 0);
  leftCommand = 0;
  rightCommand = 0;
}

bool bumperBlocks(int16_t command, uint8_t bumperPin) {
  // The rover may reverse away from a bumper but may not drive farther into it.
  return digitalRead(bumperPin) == LOW && command > 0;
}

void applyMotorCommands() {
  if (emergencyStopLatched || digitalRead(kEmergencyStopPin) == LOW) {
    stopMotors();
    return;
  }

  if (millis() - lastCommandMs > kCommandTimeoutMs) {
    stopMotors();
    return;
  }

  const int16_t safeLeft = bumperBlocks(leftCommand, kLeftBumperPin)
                               ? 0
                               : leftCommand;
  const int16_t safeRight = bumperBlocks(rightCommand, kRightBumperPin)
                                ? 0
                                : rightCommand;
  writeMotor(kLeftInputOnePin, kLeftInputTwoPin, safeLeft);
  writeMotor(kRightInputOnePin, kRightInputTwoPin, safeRight);
}

uint16_t batteryMillivolts() {
  const int raw = analogRead(kBatteryAdcPin);
  const float volts = (static_cast<float>(raw) / kAdcMax) *
                      kAdcReferenceVolts * kBatteryDividerRatio;
  return static_cast<uint16_t>(volts * 1000.0f);
}

class CommandCallbacks final : public BLECharacteristicCallbacks {
 public:
  void onWrite(BLECharacteristic* characteristic) override {
    const std::string value = characteristic->getValue();
    if (value.empty() || value.front() != 'M') {
      return;
    }

    unsigned long sequence = 0;
    int left = 0;
    int right = 0;
    if (sscanf(value.c_str(), "M,%lu,%d,%d", &sequence, &left, &right) != 3) {
      return;
    }

    // Ignore stale packets when the phone reconnects or BLE reorders writes.
    if (sequence < lastCommandSequence) {
      return;
    }
    lastCommandSequence = static_cast<uint32_t>(sequence);
    leftCommand = clampCommand(left);
    rightCommand = clampCommand(right);
    lastCommandMs = millis();
  }
};

class ServerCallbacks final : public BLEServerCallbacks {
 public:
  void onConnect(BLEServer*) override {
    lastCommandMs = millis();
  }

  void onDisconnect(BLEServer* server) override {
    stopMotors();
    server->getAdvertising()->start();
  }
};

void notifyTelemetry() {
  if (telemetryCharacteristic == nullptr) {
    return;
  }

  const int32_t left = leftTicks;
  const int32_t right = rightTicks;
  const uint32_t commandAge = millis() - lastCommandMs;
  char payload[128];
  snprintf(payload, sizeof(payload), "T,%lu,%ld,%ld,%u,%u,%lu\n",
           static_cast<unsigned long>(lastCommandSequence),
           static_cast<long>(left), static_cast<long>(right),
           static_cast<unsigned int>(batteryMillivolts()),
           emergencyStopLatched ? 1U : 0U,
           static_cast<unsigned long>(commandAge));
  telemetryCharacteristic->setValue(
      reinterpret_cast<uint8_t*>(payload), strlen(payload));
  telemetryCharacteristic->notify();
}
}  // namespace

void setup() {
  Serial.begin(115200);

  pinMode(kLeftInputOnePin, OUTPUT);
  pinMode(kLeftInputTwoPin, OUTPUT);
  pinMode(kRightInputOnePin, OUTPUT);
  pinMode(kRightInputTwoPin, OUTPUT);
  pinMode(kLeftEncoderAPin, INPUT_PULLUP);
  pinMode(kLeftEncoderBPin, INPUT_PULLUP);
  pinMode(kRightEncoderAPin, INPUT_PULLUP);
  pinMode(kRightEncoderBPin, INPUT_PULLUP);
  pinMode(kLeftBumperPin, INPUT_PULLUP);
  pinMode(kRightBumperPin, INPUT_PULLUP);
  pinMode(kEmergencyStopPin, INPUT_PULLUP);
  pinMode(kBatteryAdcPin, INPUT);
  stopMotors();

  attachInterrupt(digitalPinToInterrupt(kLeftEncoderAPin), onLeftEncoder,
                  RISING);
  attachInterrupt(digitalPinToInterrupt(kRightEncoderAPin), onRightEncoder,
                  RISING);
  attachInterrupt(digitalPinToInterrupt(kEmergencyStopPin), onEmergencyStop,
                  FALLING);

  BLEDevice::init(kDeviceName);
  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(kServiceUuid);

  BLECharacteristic* commandCharacteristic = service->createCharacteristic(
      kCommandUuid, BLECharacteristic::PROPERTY_WRITE |
                        BLECharacteristic::PROPERTY_WRITE_NR);
  commandCharacteristic->setCallbacks(new CommandCallbacks());

  telemetryCharacteristic = service->createCharacteristic(
      kTelemetryUuid, BLECharacteristic::PROPERTY_READ |
                          BLECharacteristic::PROPERTY_NOTIFY);
  telemetryCharacteristic->addDescriptor(new BLE2902());

  service->start();
  server->getAdvertising()->addServiceUUID(kServiceUuid);
  server->getAdvertising()->start();
  Serial.println("iPhone Rover ready");
}

void loop() {
  applyMotorCommands();
  if (millis() - lastTelemetryMs >= kTelemetryPeriodMs) {
    lastTelemetryMs = millis();
    notifyTelemetry();
  }
  delay(2);
}
