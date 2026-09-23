-- Apply a ChosenAction payload from the Node bridge (action.json).
-- Code owns validation — never trust the model blindly.

local M = {}

local function indices_from(params)
  if not params then return {} end
  return params.card_indices or params.indices or {}
end

--- Apply one action table { id, kind, label, params }
--- @return boolean ok, string|nil err
function M.apply(action)
  if type(action) ~= "table" or not action.kind then
    return false, "missing action.kind"
  end

  local kind = action.kind
  local params = action.params or {}

  if kind == "noop" then
    return true, nil
  end

  -- TODO: wire each branch to Steamodded / native UI controllers.
  -- Patterns below are intentional stubs so the file IPC loop can be tested
  -- with the simulated Node bridge before in-game APIs are confirmed.

  if kind == "play_hand" then
    local idxs = indices_from(params)
    -- TODO: highlight cards at idxs, then G.FUNCS.play_cards_from_highlighted()
    print("[balatro_jev] TODO play_hand indices=" .. table.concat(idxs, ","))
    return true, "stub_play_hand"
  end

  if kind == "discard" then
    local idxs = indices_from(params)
    -- TODO: highlight + G.FUNCS.discard_cards_from_highlighted()
    print("[balatro_jev] TODO discard indices=" .. table.concat(idxs, ","))
    return true, "stub_discard"
  end

  if kind == "select_blind" then
    -- TODO: select blind by params.blind_id
    print("[balatro_jev] TODO select_blind " .. tostring(params.blind_id))
    return true, "stub_select_blind"
  end

  if kind == "skip_blind" then
    print("[balatro_jev] TODO skip_blind " .. tostring(params.blind_id))
    return true, "stub_skip_blind"
  end

  if kind == "buy" then
    print("[balatro_jev] TODO buy shop_index=" .. tostring(params.shop_index))
    return true, "stub_buy"
  end

  if kind == "reroll" then
    print("[balatro_jev] TODO reroll shop")
    return true, "stub_reroll"
  end

  if kind == "cash_out" then
    print("[balatro_jev] TODO cash_out / leave shop")
    return true, "stub_cash_out"
  end

  if kind == "use_consumable" or kind == "sell" then
    print("[balatro_jev] TODO " .. kind)
    return true, "stub_" .. kind
  end

  return false, "unknown kind: " .. tostring(kind)
end

return M
