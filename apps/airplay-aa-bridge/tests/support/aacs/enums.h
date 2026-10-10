// Values from AACS include/enums.h; the misleading Specific name is retained.
#pragma once
enum EncryptionType { Plain = 0, Encrypted = 1 << 3 };
enum FrameType { First = 1, Last = 2, Bulk = First | Last };
enum MessageTypeFlags { Control = 0, Specific = 1 << 2 };
enum MessageType { ChannelOpenRequest = 7, ChannelOpenResponse = 8 };
enum MediaMessageType {
  MediaWithTimestampIndication = 0, MediaIndication = 1,
  SetupRequest = 0x8000, StartIndication = 0x8001,
  SetupResponse = 0x8003, MediaAckIndication = 0x8004,
  VideoFocusIndication = 0x8008
};
