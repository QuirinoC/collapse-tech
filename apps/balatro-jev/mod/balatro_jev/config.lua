-- balatro_jev config
-- Default entry (balatro_jev.lua) writes under Love2D save:
--   ~/Library/Application Support/Balatro/balatro_jev/
-- Point the Node bridge there via BALATRO_JEV_IPC_DIR (see apps/balatro-jev/.env).
--
-- Optional: set IPC_DIR to an absolute path and switch metadata.json main_file
-- to main.lua if you want the modular absolute-path IPC path instead.
return {
  -- Absolute path for main.lua IPC (nil = use save-dir balatro_jev/ via balatro_jev.lua).
  IPC_DIR = nil,

  -- Poll interval (Love frames / steps) for reading action.json
  ACTION_POLL_FRAMES = 15,

  -- Ignore action.json older than this many seconds (stale-response handling).
  ACTION_MAX_AGE_SEC = 8,

  -- When true, dump state every time the player could act; when false, only on request.
  AUTO_DUMP = true,
}
