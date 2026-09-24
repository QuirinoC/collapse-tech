-- Build versioned JSON-ish Lua tables matching apps/balatro-jev/src/types.ts
-- Field paths verified against Steam Balatro 1.0.1o.
-- Rich dump: phase, ante, blind, chips, hands/discards, money, hand cards,
-- jokers+effect, consumables, shop offers, pack, blinds, deck_remaining.

local M = {}

local function safe(fn, fallback)
  local ok, val = pcall(fn)
  if ok then return val end
  return fallback
end

local function card_name(card)
  return safe(function()
    if card.ability and card.ability.name then return card.ability.name end
    if card.config and card.config.center and card.config.center.name then
      return card.config.center.name
    end
    if card.config and card.config.center and card.config.center.key then
      return card.config.center.key
    end
    return "Card"
  end, "Card")
end

local function card_key(card)
  return safe(function()
    return card.config.center.key
  end, "unknown")
end

local function card_effect(card)
  return safe(function()
    if not card then return nil end
    local center = card.config and card.config.center
    if center and center.key then
      local text = localize({ type = "descriptions", key = center.key, set = center.set or "Joker" })
      if type(text) == "table" then
        local parts = {}
        for _, line in ipairs(text) do
          if type(line) == "table" then
            parts[#parts + 1] = table.concat(line, " ")
          elseif type(line) == "string" then
            parts[#parts + 1] = line
          end
        end
        local joined = table.concat(parts, " ")
        if #joined > 0 then
          return joined:sub(1, 160)
        end
      elseif type(text) == "string" and #text > 0 then
        return text:sub(1, 160)
      end
    end
    if card.ability and card.ability.name then
      return tostring(card.ability.name)
    end
    return nil
  end, nil)
end

local function chip_value(card)
  return safe(function()
    if card.get_chip_bonus then
      return card:get_chip_bonus()
    end
    if card.base and card.base.nominal then
      return card.base.nominal
    end
    return nil
  end, nil)
end

local function shop_kind(card)
  local set = safe(function() return card.ability.set end, nil)
  if set == "Joker" then return "joker" end
  if set == "Booster" then return "pack" end
  if set == "Voucher" then return "voucher" end
  if card.ability and card.ability.consumeable then return "consumable" end
  return "unknown"
end

local function raw_state_name()
  if not (G and G.STATE and G.STATES) then
    return nil
  end
  for name, val in pairs(G.STATES) do
    if val == G.STATE then
      return name
    end
  end
  return tostring(G.STATE)
end

-- Never stuck unknown when in BLIND_SELECT / SELECTING_HAND / SHOP.
local function map_phase()
  if not (G and G.STATE and G.STATES) then
    return "unknown"
  end
  local st = G.STATE

  -- Actionable hand only; transitions stay unknown so apply does not fire mid-anim.
  if st == G.STATES.SELECTING_HAND then
    return "hand"
  elseif st == G.STATES.HAND_PLAYED or st == G.STATES.DRAW_TO_HAND then
    return "unknown"
  elseif st == G.STATES.SHOP then
    return "shop"
  elseif st == G.STATES.ROUND_EVAL then
    return "round_eval"
  elseif st == G.STATES.GAME_OVER then
    return "game_over"
  elseif st == G.STATES.TAROT_PACK
    or st == G.STATES.PLANET_PACK
    or st == G.STATES.SPECTRAL_PACK
    or st == G.STATES.STANDARD_PACK
    or st == G.STATES.BUFFOON_PACK
    or (G.STATES.SMODS_BOOSTER_OPENED and st == G.STATES.SMODS_BOOSTER_OPENED) then
    return "pack_open"
  elseif st == G.STATES.MENU
    or st == G.STATES.SPLASH
    or st == G.STATES.DEMO_CTA then
    return "menu"
  elseif st == G.STATES.BLIND_SELECT or G.blind_select then
    return "blind_select"
  elseif st == G.STATES.NEW_ROUND then
    local rr = G.GAME and G.GAME.round_resets
    local states = rr and rr.blind_states
    if states and (states.Small == "Select" or states.Big == "Select" or states.Boss == "Select") then
      return "blind_select"
    end
    return "unknown"
  end
  return "unknown"
end

local function dump_blinds()
  local blinds = {}
  if not (G and G.GAME and G.GAME.round_resets) then
    return nil
  end
  local rr = G.GAME.round_resets
  local order = { "Small", "Big", "Boss" }
  local id_map = { Small = "small", Big = "big", Boss = "boss" }
  for _, key in ipairs(order) do
    local status = rr.blind_states and rr.blind_states[key]
    if status and status ~= "Hide" then
      local choice = rr.blind_choices and rr.blind_choices[key]
      local blind_def = choice and G.P_BLINDS and G.P_BLINDS[choice]
      local name = safe(function()
        return localize({ type = "name_text", key = blind_def.key, set = "Blind" })
      end, key .. " Blind")
      local chips = safe(function()
        if not blind_def then return nil end
        if G.GAME.blind and G.GAME.blind_on_deck == key then
          return G.GAME.blind.chips
        end
        return nil
      end, nil)
      blinds[#blinds + 1] = {
        id = id_map[key],
        name = name,
        native_key = key,
        status = status,
        chips = chips,
        skippable = key ~= "Boss" and (status == "Select" or status == "Current"),
      }
    end
  end
  return #blinds > 0 and blinds or nil
end

local function dump_shop()
  local shop = {}
  local flat = 0
  local function add_area(area_name, area)
    if not (area and area.cards) then return end
    for slot, card in ipairs(area.cards) do
      shop[#shop + 1] = {
        index = flat,
        slot = slot - 1,
        area = area_name,
        kind = shop_kind(card),
        id = card_key(card),
        name = card_name(card),
        cost = safe(function() return card.cost end, 0),
      }
      flat = flat + 1
    end
  end
  add_area("shop_jokers", G.shop_jokers)
  add_area("shop_vouchers", G.shop_vouchers)
  add_area("shop_booster", G.shop_booster)
  return #shop > 0 and shop or nil
end

local function dump_pack()
  local pack = {}
  if not (G and G.pack_cards and G.pack_cards.cards) then
    return nil
  end
  for i, card in ipairs(G.pack_cards.cards) do
    pack[#pack + 1] = {
      index = i - 1,
      id = card_key(card),
      name = card_name(card),
      kind = shop_kind(card),
      effect = card_effect(card),
    }
  end
  return #pack > 0 and pack or nil
end

--- @return table BalatroState v1
function M.dump()
  local phase = map_phase()
  local ante = 1
  local round = 1
  local money = 0
  local chips_needed, chips_scored, hands_left, discards_left
  local hand, jokers, consumables, blinds, shop, pack, selected
  local blind_on_deck, blind_type, reroll_cost, pack_choices_left
  local deck_remaining, shop_can_leave

  if G and G.GAME then
    ante = safe(function() return G.GAME.round_resets.ante end, ante)
    round = safe(function() return G.GAME.round end, round)
    money = safe(function() return G.GAME.dollars end, money)
    chips_needed = safe(function() return G.GAME.blind.chips end, nil)
    chips_scored = safe(function() return G.GAME.chips end, nil)
    hands_left = safe(function() return G.GAME.current_round.hands_left end, nil)
    discards_left = safe(function() return G.GAME.current_round.discards_left end, nil)
    reroll_cost = safe(function() return G.GAME.current_round.reroll_cost end, nil)
    pack_choices_left = safe(function() return G.GAME.pack_choices end, nil)
    local on = safe(function() return G.GAME.blind_on_deck end, nil)
    if on then
      blind_on_deck = string.lower(on)
    end
    blind_type = safe(function()
      if G.GAME.blind and G.GAME.blind.name then return G.GAME.blind.name end
      return blind_on_deck
    end, blind_on_deck)
  end

  deck_remaining = safe(function()
    if G.deck and G.deck.cards then return #G.deck.cards end
    return nil
  end, nil)

  shop_can_leave = safe(function()
    if G.STATE == G.STATES.SHOP then return true end
    return nil
  end, nil)

  hand = {}
  if G and G.hand and G.hand.cards then
    for i, card in ipairs(G.hand.cards) do
      hand[#hand + 1] = {
        index = i - 1,
        rank = safe(function() return card.base.value end, "?"),
        suit = safe(function() return card.base.suit end, "?"),
        enhancement = safe(function() return card.ability and card.ability.effect end, nil),
        edition = safe(function() return card.edition and card.edition.type end, nil),
        seal = safe(function() return card.seal end, nil),
        chip_value = chip_value(card),
      }
    end
  end

  selected = {}
  if G and G.hand and G.hand.highlighted and G.hand.cards then
    for _, hcard in ipairs(G.hand.highlighted) do
      for i, card in ipairs(G.hand.cards) do
        if card == hcard then
          selected[#selected + 1] = i - 1
          break
        end
      end
    end
  end

  jokers = {}
  if G and G.jokers and G.jokers.cards then
    for i, j in ipairs(G.jokers.cards) do
      jokers[#jokers + 1] = {
        index = i - 1,
        id = card_key(j),
        name = card_name(j),
        effect = card_effect(j),
        sell_value = safe(function() return j.sell_cost end, nil),
      }
    end
  end

  consumables = {}
  if G and G.consumeables and G.consumeables.cards then
    for i, c in ipairs(G.consumeables.cards) do
      consumables[#consumables + 1] = {
        index = i - 1,
        id = card_key(c),
        name = card_name(c),
        set = safe(function() return c.ability.set end, nil),
        effect = card_effect(c),
        sell_value = safe(function() return c.sell_cost end, nil),
      }
    end
  end

  blinds = dump_blinds()
  shop = dump_shop()
  pack = dump_pack()

  if phase == "unknown" and blinds then
    for _, b in ipairs(blinds) do
      if b.status == "Select" or b.status == "Current" then
        phase = "blind_select"
        break
      end
    end
  end

  return {
    version = 1,
    phase = phase,
    ante = ante,
    round = round,
    money = money,
    chips_needed = chips_needed,
    chips_scored = chips_scored,
    hands_left = hands_left,
    discards_left = discards_left,
    hand_size = #hand > 0 and #hand or nil,
    hand = #hand > 0 and hand or nil,
    selected = #selected > 0 and selected or nil,
    jokers = #jokers > 0 and jokers or nil,
    consumables = #consumables > 0 and consumables or nil,
    blinds = blinds,
    blind_on_deck = blind_on_deck,
    blind_type = blind_type,
    shop = shop,
    reroll_cost = reroll_cost,
    shop_can_leave = shop_can_leave,
    pack = pack,
    pack_choices_left = pack_choices_left,
    deck_remaining = deck_remaining,
    raw_state = G and G.STATE or nil,
    raw_state_name = raw_state_name(),
    has_blind_select_ui = G and G.blind_select ~= nil or false,
    notes = "balatro_jev dump v4 full-context",
  }
end

return M
