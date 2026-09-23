-- File IPC: write state.json, read action.json.
-- Love2D provides love.filesystem; for absolute paths outside the save dir
-- we fall back to io.open (works on desktop Steam builds).

local M = {}

local function encode_json(value)
  -- Minimal JSON encoder for our state tables (no cycles, no sparse arrays).
  local t = type(value)
  if t == "nil" then
    return "null"
  elseif t == "boolean" then
    return value and "true" or "false"
  elseif t == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return "null"
    end
    return tostring(value)
  elseif t == "string" then
    return '"' .. value:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r') .. '"'
  elseif t == "table" then
    local is_array = true
    local n = 0
    for k, _ in pairs(value) do
      n = n + 1
      if type(k) ~= "number" then is_array = false break end
    end
    if is_array then
      local parts = {}
      for i = 1, #value do
        parts[#parts + 1] = encode_json(value[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, v in pairs(value) do
        if type(k) == "string" and v ~= nil then
          parts[#parts + 1] = encode_json(k) .. ":" .. encode_json(v)
        end
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

function M.write_state(ipc_dir, state)
  assert(ipc_dir and #ipc_dir > 0, "IPC_DIR not configured")
  local path = ipc_dir:gsub("/$", "") .. "/state.json"
  local f, err = io.open(path, "w")
  if not f then return false, err end
  f:write(encode_json(state))
  f:write("\n")
  f:close()
  return true
end

function M.read_action(ipc_dir)
  assert(ipc_dir and #ipc_dir > 0, "IPC_DIR not configured")
  local path = ipc_dir:gsub("/$", "") .. "/action.json"
  local f = io.open(path, "r")
  if not f then return nil, "missing" end
  local body = f:read("*a")
  f:close()
  if not body or #body == 0 then return nil, "empty" end
  -- Prefer a real JSON decoder when available (lovely/json libs); else return raw.
  -- Bridge writes well-formed JSON; Lua 5.1 in Love often lacks native decode.
  -- TODO: use SMODS/json or dkjson when present.
  return body, nil
end

function M.clear_action(ipc_dir)
  local path = ipc_dir:gsub("/$", "") .. "/action.json"
  os.remove(path)
end

M.encode_json = encode_json
return M
