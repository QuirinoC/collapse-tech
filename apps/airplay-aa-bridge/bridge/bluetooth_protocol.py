"""Restricted phone-side AA Bluetooth protocol; no Bluetooth operations on import."""
from __future__ import annotations
from dataclasses import dataclass
import hmac
import re
import time
import select

MAC_PATTERN = re.compile(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}")
HFP_AG_UUID = "0000111f-0000-1000-8000-00805f9b34fb"

class PairingRejected(Exception):
    pass


def varint(number):
    number &= (1 << 64) - 1
    data = bytearray()
    while number > 127:
        data.append((number & 127) | 128)
        number >>= 7
    return bytes(data) + bytes([number])


def integer(field, number):
    return varint(field << 3) + varint(number)


def text(field, data):
    data = data.encode("ascii")
    return varint((field << 3) | 2) + varint(len(data)) + data


def read_fields(data):
    offset, fields = 0, {}
    def take_varint():
        nonlocal offset
        value = 0
        for index in range(10):
            if offset == len(data):
                raise PairingRejected("truncated protobuf varint")
            byte = data[offset]
            offset += 1
            if index == 9 and byte > 1:
                raise PairingRejected("overflowing protobuf varint")
            value |= (byte & 127) << (index * 7)
            if not byte & 128:
                return value
        raise PairingRejected("overlong protobuf varint")
    while offset < len(data):
        tag = take_varint()
        field, wire = tag >> 3, tag & 7
        if not field:
            raise PairingRejected("invalid field number")
        if wire == 0:
            value = take_varint()
        elif wire in (1, 2, 5):
            size = take_varint() if wire == 2 else {1: 8, 5: 4}[wire]
            if offset + size > len(data):
                raise PairingRejected("truncated protobuf field")
            value = data[offset:offset + size]
            offset += size
        else:
            raise PairingRejected("unsupported protobuf group")
        fields.setdefault(field, []).append((wire, value))
    return fields


def one(fields, field, wire):
    values = fields.get(field, [])
    if len(values) != 1 or values[0][0] != wire:
        raise PairingRejected("missing, duplicate, or wrongly typed field")
    return values[0][1]


def signed32(value):
    value &= 0xffffffff
    return value - 0x100000000 if value >= 0x80000000 else value


def protocol_int32(value):
    if not 0 <= value <= 0xffffffff and not 0xffffffff80000000 <= value <= 0xffffffffffffffff:
        raise PairingRejected("protobuf integer exceeds signed32 representation")
    return signed32(value)


def phone_pairing_response(body):
    """Audited PHONE layout; omitted optional already_paired means false."""
    fields = read_fields(body)
    status = protocol_int32(one(fields, 1, 0))
    paired = one(fields, 2, 0) if 2 in fields else 0
    if paired not in (0, 1):
        raise PairingRejected("already-paired field is not a boolean")
    return status, bool(paired), status == 0


def packed_numbers(data):
    # Reuse the strict protobuf parser by representing each packed number as a
    # separate varint field. No permissive truncation or field guessing.
    values, position = [], 0
    while position < len(data):
        number = 0
        for index in range(10):
            if position >= len(data):
                raise PairingRejected("truncated packed pairing method")
            byte = data[position]
            position += 1
            if index == 9 and byte > 1:
                raise PairingRejected("overflowing packed pairing method")
            number |= (byte & 127) << (7 * index)
            if byte < 128:
                values.append(protocol_int32(number))
                break
        else:
            raise PairingRejected("overlong packed pairing method")
    return values


def current_bluetooth_descriptor(data, pinned_address):
    descriptors = []
    channels = read_fields(data).get(1, [])
    if not channels:
        raise PairingRejected("service discovery contains no channels")
    for wire, body in channels:
        if wire != 2:
            raise PairingRejected("wrongly typed service channel")
        fields = read_fields(body)
        channel = one(fields, 1, 0)
        if 6 not in fields:
            continue
        bluetooth = read_fields(one(fields, 6, 2))
        try:
            address = one(bluetooth, 1, 2).decode("ascii").upper()
        except UnicodeError as error:
            raise PairingRejected("invalid advertised Bluetooth address") from error
        methods = []
        for method_wire, value in bluetooth.get(2, []):
            if method_wire == 0:
                methods.append(protocol_int32(value))
            elif method_wire == 2:
                methods.extend(packed_numbers(value))
            else:
                raise PairingRejected("wrongly typed pairing method")
        if not MAC_PATTERN.fullmatch(address) or address != pinned_address.upper():
            raise PairingRejected("advertised peer differs from the pinned car")
        if not 1 <= channel <= 254 or 2 not in methods:
            raise PairingRejected("current car does not advertise a valid Bluetooth channel and numeric comparison")
        descriptors.append((channel, address, methods))
    if not descriptors:
        return None
    if len(descriptors) != 1:
        raise PairingRejected("expected exactly one current car Bluetooth descriptor")
    return descriptors[0]



@dataclass
class PairingGate:
    phone_mac: str
    car_mac: str
    channel: int
    method: int = 2
    timeout: float = 60.0
    active: bool = False
    prepared: bool = False
    channel_opened: bool = False
    previously_paired: bool = False
    confirmed: bool = False
    bonded: bool = False
    failed: bool = False
    auth_data: str | None = None
    expires: float = 0.0

    def check(self, device=None):
        if self.failed or not self.active or time.monotonic() >= self.expires:
            raise PairingRejected("pairing session is inactive, expired, or failed")
        if device is not None and device.upper() != self.car_mac:
            raise PairingRejected("device is outside the current car session")

    def begin(self, descriptor_mac, supported_methods):
        if descriptor_mac.upper() != self.car_mac or self.method not in supported_methods:
            raise PairingRejected("descriptor does not advertise this car and pairing method")
        if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", self.phone_mac):
            raise PairingRejected("invalid phone MAC")
        if not MAC_PATTERN.fullmatch(self.car_mac) or not 1 <= self.channel <= 254:
            raise PairingRejected("invalid pinned car address or Bluetooth channel")
        if self.active or self.failed:
            raise PairingRejected("pairing session already started")
        self.active, self.expires = True, time.monotonic() + self.timeout
        # AACS RawData header; generic/control bit is true for ChannelOpen.
        return bytes([1, self.channel, 1]) + b"\x00\x07" + integer(1, 0) + integer(2, self.channel)

    def opened(self, body):
        self.check()
        if self.channel_opened:
            raise PairingRejected("duplicate Bluetooth channel response")
        if protocol_int32(one(read_fields(body), 1, 0)) != 0:
            self.failed = True
            raise PairingRejected("head unit refused the Bluetooth channel")
        self.channel_opened = True
        return bytes([1, self.channel, 0]) + b"\x80\x01" + text(1, self.phone_mac) + integer(2, self.method)

    def preparation(self, body):
        self.check()
        if not self.channel_opened or self.prepared:
            raise PairingRejected("pairing preparation is out of order or duplicated")
        status, paired, accepted = phone_pairing_response(body)
        if not accepted:
            self.failed = True
            raise PairingRejected("head unit refused pairing preparation (status %d)" % status)
        self.prepared, self.previously_paired = True, paired

    def authentication(self, body):
        self.check()
        if not self.prepared:
            raise PairingRejected("authentication arrived before successful preparation")
        try:
            value = one(read_fields(body), 1, 2).decode("ascii")
        except UnicodeError as error:
            raise PairingRejected("authentication data is not ASCII") from error
        if self.method == 2 and not re.fullmatch(r"[0-9]{6}", value):
            self.failed = True
            raise PairingRejected("invalid numeric-comparison authentication data")
        if self.auth_data is not None and not hmac.compare_digest(self.auth_data, value):
            self.failed = True
            raise PairingRejected("authentication challenge changed within the pairing session")
        self.auth_data = value

    def numeric_confirmation(self, device, bluez_passkey):
        self.check(device)
        if not self.prepared or self.auth_data is None:
            return None  # Wait for AA auth; do not accept a missing challenge.
        if not 0 <= int(bluez_passkey) <= 999999 or not hmac.compare_digest(
                self.auth_data, format(int(bluez_passkey), "06d")):
            self.failed = True
            raise PairingRejected("AA and Bluetooth authentication data mismatch")
        return True

    def paired_property(self, device, paired):
        self.check(device)
        self.bonded = bool(paired)
        if self.bonded and not (self.confirmed or self.previously_paired):
            raise PairingRejected("new bond lacks verified confirmation")

    def auth_result(self):
        self.check()
        if not self.prepared or not self.confirmed:
            raise PairingRejected("authentication result requires successful current numeric confirmation")
        # This reports processing of AA authentication data, not bond completion.
        # Send after replying to BlueZ's matched SSP confirmation, before waiting
        # for Pair() completion: the HU may await this result to confirm its side.
        return bytes([1, self.channel, 0]) + b"\x80\x04" + integer(1, 0)

    def close(self):
        self.active = False
        self.failed = True
        self.auth_data = None



def send(sock, data):
    if sock.send(data) != len(data):
        raise PairingRejected("short AAServer packet write")


def receive(sock, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0 or not select.select([sock], [], [], remaining)[0]:
        raise TimeoutError("AA response deadline expired")
    data = sock.recv(256 * 1024)
    if not data:
        raise PairingRejected("AA client disconnected")
    return data


def fetch_descriptor(sock, deadline, pinned_address):
    """Read this connection's SDR only after service discovery has completed.

    AAServer's socket exists before its cached SDR. The existing video-channel
    query returns 255 until discovery, avoiding a zero-length descriptor packet
    that is indistinguishable from socket EOF. Broadcasts may interleave replies.
    """
    while True:
        send(sock, bytes([0, 0, 0]))
        while True:
            data = receive(sock, deadline)
            if len(data) == 1:
                break
        if data[0] not in (0, 255):
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("AA service discovery deadline expired")
        time.sleep(min(.1, remaining))
    send(sock, bytes([2, 0, 0]))
    while True:
        data = receive(sock, deadline)
        try:
            return current_bluetooth_descriptor(data, pinned_address)
        except PairingRejected:
            # Broadcast channel messages carry channel + bool + message type.
            # Try the real SDR first: a descriptor length may also be 0xff.
            if len(data) >= 4 and data[1] in (0, 255):
                continue
            raise
