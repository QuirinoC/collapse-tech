import CoreBluetooth
import Combine
import Foundation

final class BluetoothRoverTransport: NSObject, ObservableObject {
    @Published private(set) var connectionState: RoverConnectionState = .disconnected
    @Published private(set) var telemetry: RoverTelemetry?

    private lazy var central = CBCentralManager(delegate: self, queue: nil)
    private var peripheral: CBPeripheral?
    private var commandCharacteristic: CBCharacteristic?
    private var telemetryCharacteristic: CBCharacteristic?
    private var pendingConnection = false

    func connect() {
        pendingConnection = true
        guard central.state == .poweredOn else {
            connectionState = .scanning
            _ = central
            return
        }

        connectionState = .scanning
        central.scanForPeripherals(
            withServices: [CBUUID(string: RoverBluetooth.service)],
            options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
        )
    }

    func disconnect() {
        pendingConnection = false
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        } else {
            connectionState = .disconnected
        }
    }

    func send(_ command: MotorCommand) {
        guard let peripheral, let characteristic = commandCharacteristic else {
            return
        }
        peripheral.writeValue(command.wireData, for: characteristic, type: .withoutResponse)
    }

    private func resetConnection() {
        peripheral = nil
        commandCharacteristic = nil
        telemetryCharacteristic = nil
        telemetry = nil
        connectionState = .disconnected
    }
}

extension BluetoothRoverTransport: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard central.state == .poweredOn, pendingConnection else {
            if central.state != .poweredOn {
                connectionState = .fault("Bluetooth is unavailable")
            }
            return
        }
        connect()
    }

    func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        guard self.peripheral == nil else { return }
        self.peripheral = peripheral
        peripheral.delegate = self
        connectionState = .connecting
        central.stopScan()
        central.connect(peripheral)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectionState = .connecting
        peripheral.discoverServices([CBUUID(string: RoverBluetooth.service)])
    }

    func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        connectionState = .fault(error?.localizedDescription ?? "Unable to connect")
        resetConnection()
    }

    func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        resetConnection()
        if pendingConnection {
            connect()
        }
    }
}

extension BluetoothRoverTransport: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard error == nil,
              let service = peripheral.services?.first(where: {
                  $0.uuid == CBUUID(string: RoverBluetooth.service)
              })
        else {
            connectionState = .fault(error?.localizedDescription ?? "Rover service missing")
            return
        }
        peripheral.discoverCharacteristics(
            [
                CBUUID(string: RoverBluetooth.command),
                CBUUID(string: RoverBluetooth.telemetry)
            ],
            for: service
        )
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        guard error == nil else {
            connectionState = .fault(error!.localizedDescription)
            return
        }

        for characteristic in service.characteristics ?? [] {
            if characteristic.uuid == CBUUID(string: RoverBluetooth.command) {
                commandCharacteristic = characteristic
            } else if characteristic.uuid == CBUUID(string: RoverBluetooth.telemetry) {
                telemetryCharacteristic = characteristic
                peripheral.setNotifyValue(true, for: characteristic)
            }
        }

        if commandCharacteristic != nil, telemetryCharacteristic != nil {
            connectionState = .connected
        }
    }

    func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        guard error == nil, characteristic.uuid == CBUUID(string: RoverBluetooth.telemetry),
              let value = characteristic.value,
              let telemetry = RoverTelemetry(wireData: value)
        else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            self?.telemetry = telemetry
        }
    }
}
