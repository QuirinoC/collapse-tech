--- STEAMODDED HEADER
--- MOD_NAME: Balatro Jev Bridge
--- MOD_ID: balatro_jev
--- MOD_AUTHOR: [Collapse Tech]
--- MOD_DESCRIPTION: Dump game state JSON and apply Jev-chosen actions for apps/balatro-jev.
--- PRIORITY: 0
--- BADGE_COLOUR: E85D04
--- PREFIX: bjev
--- VERSION: 0.2.0
----------------------------------------------
------------ MOD CODE ------------------------

-- IPC under Love2D save dir: balatro_jev/{state,action}.json
-- Point BALATRO_JEV_IPC_DIR at that folder for the TS bridge.

local IPC_DIR = "balatro_jev"
local STATE_FILE = IPC_DIR .. "/state.json"
local ACTION_FILE = IPC_DIR .. "/action.json"
local ACTION_APPLIED_FILE = IPC_DIR .. "/action.applied"
local ACTION_RESULT_FILE = IPC_DIR .. "/action_result.json"

local function load_mod_file(name)
  if SMODS and SMODS.load_file then
    local ok, mod = pcall(function()
      return SMODS.load_file(name)()
    end)
    if ok and type(mod) == "table" then
      return mod
    end
  end
  local ok2, mod2 = pcall(function()
    return require(name:gsub("%.lua$", ""))
  end)
  if ok2 and type(mod2) == "table" then
    return mod2
  end
  return nil
end

local state_mod = load_mod_file("state.lua")
local actions_mod = load_mod_file("actions.lua")

local function ensure_dir()
  if love and love.filesystem and love.filesystem.createDirectory then
    love.filesystem.createDirectory(IPC_DIR)
  end
end

local function json_escape(s)
  s = tostring(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub('"', '\\"')
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  s = s:gsub("\t", "\\t")
  return s
end

local function to_json(v)
  local t = type(v)
  if t == "nil" then
    return "null"
  elseif t == "boolean" then
    return v and "true" or "false"
  elseif t == "number" then
    return tostring(v)
  elseif t == "string" then
    return '"' .. json_escape(v) .. '"'
  elseif t == "table" then
    local is_array = true
    local n = 0
    for k, _ in pairs(v) do
      if type(k) ~= "number" then
        is_array = false
        break
      end
      if k > n then
        n = k
      end
    end
    if is_array then
      local parts = {}
      for i = 1, n do
        parts[#parts + 1] = to_json(v[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, val in pairs(v) do
        parts[#parts + 1] = '"' .. json_escape(k) .. '":' .. to_json(val)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

local function write_file(path, contents)
  ensure_dir()
  if love and love.filesystem and love.filesystem.write then
    love.filesystem.write(path, contents)
    return true
  end
  local f = io.open(path, "w")
  if not f then
    return false
  end
  f:write(contents)
  f:close()
  return true
end

local function read_file(path)
  if love and love.filesystem and love.filesystem.read then
    if love.filesystem.getInfo and not love.filesystem.getInfo(path) then
      return nil
    end
    return love.filesystem.read(path)
  end
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local data = f:read("*a")
  f:close()
  return data
end

local function match_str(json, key)
  return json:match('"' .. key .. '"%s*:%s*"([^"]*)"')
end

local function match_num(json, key)
  return tonumber(json:match('"' .. key .. '"%s*:%s*(-?%d+%.?%d*)'))
end

local function match_num_array(json, key)
  local block = json:match('"' .. key .. '"%s*:%s*%[([^%]]*)%]')
  local out = {}
  if not block then
    return out
  end
  for n in block:gmatch("(%-?%d+)") do
    out[#out + 1] = tonumber(n)
  end
  return out
end

--- Peek action.json from the TS bridge into { id, kind, params }.
local function parse_action(json)
  if not json then
    return nil
  end
  local kind = match_str(json, "kind")
  if not kind then
    return nil
  end
  return {
    id = match_str(json, "id"),
    kind = kind,
    label = match_str(json, "label"),
    params = {
      card_indices = match_num_array(json, "card_indices"),
      shop_index = match_num(json, "shop_index"),
      shop_slot = match_num(json, "shop_slot"),
      shop_area = match_str(json, "shop_area"),
      blind_id = match_str(json, "blind_id"),
      native_key = match_str(json, "native_key"),
      index = match_num(json, "index"),
      pack_index = match_num(json, "pack_index"),
      target = match_str(json, "target"),
      item_id = match_str(json, "item_id"),
      item_kind = match_str(json, "item_kind"),
    },
  }
end

local function dump_state()
  if state_mod and state_mod.dump then
    return state_mod.dump()
  end
  return {
    version = 1,
    phase = "unknown",
    ante = 1,
    round = 1,
    money = 0,
    notes = "state.lua missing",
  }
end

local function apply_action(action)
  if actions_mod and actions_mod.apply then
    return actions_mod.apply(action)
  end
  return false, "actions.lua missing"
end

local last_dump = 0
local DUMP_INTERVAL = 0.75 -- seconds
local last_phase = nil

local function tick(dt)
  last_dump = last_dump + (dt or 0)
  if last_dump >= DUMP_INTERVAL then
    last_dump = 0
    local ok, err = pcall(function()
      local state = dump_state()
      write_file(STATE_FILE, to_json(state))
      if state.phase ~= last_phase then
        print("[balatro_jev] phase=" .. tostring(state.phase))
        last_phase = state.phase
      end
    end)
    if not ok then
      print("[balatro_jev] dump failed: " .. tostring(err))
    end
  end

  local raw = read_file(ACTION_FILE)
  if not raw then
    return
  end
  local applied = read_file(ACTION_APPLIED_FILE)
  if applied == raw then
    return
  end

  local action = parse_action(raw)
  local ok, msg = apply_action(action)
  print(
    "[balatro_jev] apply "
      .. tostring(action and action.kind)
      .. " => "
      .. tostring(ok)
      .. " "
      .. tostring(msg)
  )
  write_file(
    ACTION_RESULT_FILE,
    to_json({
      ok = ok and true or false,
      kind = action and action.kind or nil,
      detail = tostring(msg),
      at = os.time(),
    })
  )
  -- Always stamp applied so a bad action cannot spin forever.
  -- Bridge watch-loop re-engages on stuck identical state.
  write_file(ACTION_APPLIED_FILE, raw)
end

-- Love2D update hook
local _update = love and love.update
if love then
  function love.update(dt)
    if _update then
      _update(dt)
    end
    tick(dt)
  end
end

_G.BalatroJev = {
  dump = dump_state,
  apply = apply_action,
  tick = tick,
}

print("[balatro_jev] loaded — writing " .. STATE_FILE)

----------------------------------------------
------------ MOD CODE END --------------------
