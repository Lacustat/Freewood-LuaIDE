-- Freewood NetProbe (Lacustat): Welche Wege fuer Addon-Daten gibt es in Forever und sind sie unsichtbar?
-- Befehle: /fwnp self | call | chan | club | types | show | clear | target <Name> | stop
-- Ergebnis steht im Chat und nach /reload in SavedVariables\FreewoodNetProbe.lua (FreewoodNetProbeDB.log).

local PREFIX = "FWNP1"
local G = _G
local DB
local stopFlag = false
local answered = false
local seen = {}
local echo = { addon = false, chat = false }
local OWNERS = { "pinky", "dr", "aroki", "lujinja" }

local function Safe(v)
    if G.issecretvalue and G.issecretvalue(v) then return "<geheim>" end
    return tostring(v)
end

local function Log(kind, text)
    DB.log = DB.log or {}
    local line = (G.date and G.date("%H:%M:%S") or "") .. " " .. kind .. " " .. text
    table.insert(DB.log, line)
    while #DB.log > 600 do table.remove(DB.log, 1) end
    print("|cff66ccffFWNP|r " .. kind .. " " .. text)
end

local function ResultName(res)
    if type(res) == "number" and G.Enum and G.Enum.SendAddonMessageResult then
        for k, v in pairs(G.Enum.SendAddonMessageResult) do if v == res then return k .. "(" .. res .. ")" end end
    end
    return Safe(res)
end

-- gesehene Chatzeilen (um zu pruefen, ob etwas sichtbar wurde)
local function Watch()
    for i = 1, (G.NUM_CHAT_WINDOWS or 7) do
        local f = G["ChatFrame" .. i]
        if f and f.AddMessage then
            G.hooksecurefunc(f, "AddMessage", function(_, msg)
                if G.issecretvalue and G.issecretvalue(msg) then return end
                if type(msg) ~= "string" or msg:find("FWNP", 1, true) then return end
                seen[#seen + 1] = { t = G.GetTime(), m = msg:lower() }
                if #seen > 80 then table.remove(seen, 1) end
            end)
        end
    end
end

local function VisibleSince(t0)
    for _, s in ipairs(seen) do
        if s.t >= t0 and (s.m:find("test", 1, true) or s.m:find(PREFIX:lower(), 1, true)) then return s.m end
    end
    return nil
end

local function SendAddon(dist, target, label, cb)
    local t0 = G.GetTime()
    local api = G.C_ChatInfo
    local ok, res
    if api and api.SendAddonMessage then ok, res = pcall(api.SendAddonMessage, PREFIX, "test", dist, target)
    elseif G.SendAddonMessage then ok, res = pcall(G.SendAddonMessage, PREFIX, "test", dist, target) end
    Log("SENDEN", label .. " ok=" .. tostring(ok) .. " Ergebnis=" .. ResultName(res))
    G.C_Timer.After(2.5, function()
        local v = VisibleSince(t0)
        Log("SICHTBAR", label .. ": " .. (v and ("JA im Chat: " .. v:sub(1, 60)) or "nein"))
        if cb then cb() end
    end)
end

------------------------------------------------------------------------
-- Tests
------------------------------------------------------------------------

local function TestSelf()
    local name = G.UnitName("player")
    local cands = {}
    if G.UnitFullName then local a, b = G.UnitFullName("player"); cands[#cands + 1] = Safe(a) .. "|" .. Safe(b) end
    if G.GetUnitName then
        cands[#cands + 1] = Safe(G.GetUnitName("player", true))
        cands[#cands + 1] = Safe(G.GetUnitName("player", false))
    end
    local u1, u2 = G.UnitName("player")
    cands[#cands + 1] = Safe(u1) .. "|" .. Safe(u2)
    Log("SELF", "Namenskandidaten: " .. table.concat(cands, "  ;  "))
    for _, c in ipairs(cands) do
        local n = c:gsub("|nil$", "")
        if n:find(" ") and not n:find("|") then name = n break end
    end
    if name == G.UnitName("player") and G.UnitFullName then
        local a, b = G.UnitFullName("player")
        if a and b and Safe(b) ~= "nil" and Safe(b) ~= "" then name = a .. " " .. b end
    end
    Log("SELF", "Fluestern an mich selbst: " .. tostring(name))
    SendAddon("WHISPER", name, "WHISPER an " .. tostring(name))
end

local function TestCall()
    Log("CALL", "rufe alle in der Gilde (unsichtbare Addon-Nachricht)")
    SendAddon("GUILD", nil, "GUILD CALL", nil)
    local api = G.C_ChatInfo
    if api and api.SendAddonMessage then pcall(api.SendAddonMessage, PREFIX, "CALL", "GUILD") end
end

local function TestClub()
    local C = G.C_Club
    Log("CLUB", "C_Club vorhanden: " .. tostring(C ~= nil))
    if not C then return end
    for _, fn in ipairs({ "GetSubscribedClubs", "GetStreams", "SendMessage", "GetClubInfo", "GetClubMembers" }) do
        Log("CLUB", fn .. " = " .. type(C[fn]))
    end
    if C.GetSubscribedClubs then
        local ok, clubs = pcall(C.GetSubscribedClubs)
        if ok and type(clubs) == "table" then
            Log("CLUB", "abonnierte Gemeinschaften: " .. #clubs)
            for _, c in ipairs(clubs) do
                Log("CLUB", "Club " .. Safe(c.name) .. " id=" .. Safe(c.clubId) .. " typ=" .. Safe(c.clubType))
                if C.GetStreams then
                    local ok2, st = pcall(C.GetStreams, c.clubId)
                    if ok2 and type(st) == "table" then
                        for _, s in ipairs(st) do Log("CLUB", "  Stream " .. Safe(s.name) .. " id=" .. Safe(s.streamId) .. " typ=" .. Safe(s.streamType)) end
                    end
                end
            end
        else
            Log("CLUB", "GetSubscribedClubs Fehler: " .. Safe(clubs))
        end
    end
end

local function TestTypes()
    local list = { "SAY", "YELL", "PARTY", "RAID", "INSTANCE_CHAT", "GUILD", "OFFICER", "CLUB", "COMMUNITY" }
    local function Step(i)
        if stopFlag or i > #list then Log("ARTEN", "fertig") return end
        SendAddon(list[i], nil, "Art " .. list[i], function() G.C_Timer.After(1, function() Step(i + 1) end) end)
    end
    stopFlag = false
    Step(1)
end

local function ListChannels(leave)
    local n = 0
    for i = 1, 30 do
        local id, name, inst, comm = G.GetChannelName(i)
        if name and Safe(name) ~= "nil" and Safe(name) ~= "" then
            n = n + 1
            Log("LISTE", "Platz " .. i .. ": id=" .. Safe(id) .. " name=" .. Safe(name) .. " gemeinschaft=" .. Safe(comm))
            if leave then
                local low = Safe(name):lower()
                if low:find("^freewood") or low:find("^fw") then
                    pcall(G.LeaveChannelByName, Safe(name))
                    Log("LISTE", "  verlassen: " .. Safe(name))
                end
            end
        end
    end
    Log("LISTE", "Kanaele gesamt: " .. n)
end

local function SendTo(id)
    id = tonumber(id)
    if not id then print("FWNP: /fwnp send <Kanalnummer>") return end
    echo.addon, echo.chat = false, false
    local t0 = G.GetTime()
    local api = G.C_ChatInfo
    local ok1, r1 = false, nil
    if api and api.SendAddonMessage then ok1, r1 = pcall(api.SendAddonMessage, PREFIX, "test", "CHANNEL", id) end
    Log("SEND", "Kanal " .. id .. " Addon ok=" .. tostring(ok1) .. " " .. ResultName(r1))
    G.C_Timer.After(3, function()
        Log("SEND", "Kanal " .. id .. " Echo Addon=" .. tostring(echo.addon) .. " sichtbar=" .. tostring(VisibleSince(t0) ~= nil))
        local ok2, r2 = pcall(G.SendChatMessage, "test", "CHANNEL", nil, id)
        Log("SEND", "Kanal " .. id .. " Chat ok=" .. tostring(ok2) .. " " .. Safe(r2))
        G.C_Timer.After(3, function()
            Log("SEND", "Kanal " .. id .. " Echo Chat=" .. tostring(echo.chat))
        end)
    end)
end

-- Lasttest: N Fluesternachrichten an mich selbst, so schnell wie moeglich, mit 240 Zeichen
local burst
local function Burst(n)
    n = tonumber(n) or 50
    local name = G.UnitName("player")
    local first, sur = G.UnitFullName("player")
    local a2, b2 = G.UnitFullName("player")
    local full = G.GetUnitName and G.GetUnitName("player", true)
    if full and Safe(full):find(" ") then name = Safe(full) elseif a2 and G.UnitName("player") then name = name end
    if not name:find(" ") then name = name .. " Freewood" end
    burst = { n = n, got = 0, codes = {}, t0 = G.GetTime(), name = name }
    local pad = string.rep("x", 230)
    local api = G.C_ChatInfo
    for i = 1, n do
        local ok, res = pcall(api.SendAddonMessage, PREFIX, "B" .. i .. "|" .. pad, "WHISPER", name)
        local k = ResultName(res)
        burst.codes[k] = (burst.codes[k] or 0) + 1
    end
    Log("LAST", n .. " Nachrichten gesendet in " .. string.format("%.2f", G.GetTime() - burst.t0) .. " s an " .. name)
    G.C_Timer.After(10, function()
        local parts = {}
        for k, v in pairs(burst.codes) do parts[#parts + 1] = k .. "=" .. v end
        Log("LAST", "Rueckgabecodes: " .. table.concat(parts, ", ") .. " | angekommen: " .. burst.got .. " von " .. burst.n)
    end)
end

local function TestChan()
    stopFlag = false
    local function Next(i)
        if stopFlag or i > 6 then Log("KANAL", "Schleife fertig") return end
        local name = "FwProbe" .. i
        Log("KANAL", "Test " .. name)
        pcall(G.JoinChannelByName, name)
        G.C_Timer.After(2, function()
            if G.GetChannelList then
                local t = { G.GetChannelList() }
                local parts = {}
                for i = 1, math.min(#t, 24) do parts[#parts + 1] = Safe(t[i]) end
                Log("KANAL", "GetChannelList: " .. table.concat(parts, ","))
            end
            if G.C_ChatInfo and G.C_ChatInfo.GetChannelInfoFromIdentifier then
                local ok, info = pcall(G.C_ChatInfo.GetChannelInfoFromIdentifier, name)
                Log("KANAL", "GetChannelInfoFromIdentifier ok=" .. tostring(ok) .. " name=" .. Safe(type(info) == "table" and info.name or info) .. " id=" .. Safe(type(info) == "table" and info.localID or nil))
            end
            local id, cname = G.GetChannelName and G.GetChannelName(name)
            Log("KANAL", name .. " Nummer=" .. Safe(id) .. " Name=" .. Safe(cname))
            if not id or id == 0 then
                Log("KANAL", name .. ": Beitritt nicht bestaetigt, ueberspringe (nichts gesendet)")
                pcall(G.LeaveChannelByName, name)
                G.C_Timer.After(1, function() Next(i + 1) end)
                return
            end
            echo.addon, echo.chat = false, false
            local t0 = G.GetTime()
            local api = G.C_ChatInfo
            local ok1, r1 = false, nil
            if api and api.SendAddonMessage then ok1, r1 = pcall(api.SendAddonMessage, PREFIX, "test", "CHANNEL", id) end
            local ok2, r2 = pcall(G.SendChatMessage, "test", "CHANNEL", nil, id)
            Log("KANAL", name .. " Addon-Senden ok=" .. tostring(ok1) .. " " .. ResultName(r1) .. " | Chat-Senden ok=" .. tostring(ok2) .. " " .. Safe(r2))
            G.C_Timer.After(3, function()
                Log("KANAL", name .. " Echo Addon=" .. tostring(echo.addon) .. " Chat=" .. tostring(echo.chat) .. " Sichtbar=" .. tostring(VisibleSince(t0) ~= nil))
                pcall(G.LeaveChannelByName, name)
                G.C_Timer.After(2, function() Next(i + 1) end)
            end)
        end)
    end
    Next(1)
end

------------------------------------------------------------------------
-- Ereignisse
------------------------------------------------------------------------

local function IsOwner(sender)
    local s = Safe(sender):lower():gsub("%-.*$", "")
    for _, o in ipairs(OWNERS) do
        if s:find("^" .. o) then return true end
    end
    return false
end

local f = G.CreateFrame("Frame")
f:RegisterEvent("ADDON_LOADED")
f:RegisterEvent("CHAT_MSG_ADDON")
f:RegisterEvent("CHAT_MSG_WHISPER")
f:RegisterEvent("CHAT_MSG_CHANNEL")
f:RegisterEvent("CHAT_MSG_SYSTEM")
f:RegisterEvent("UI_ERROR_MESSAGE")
f:SetScript("OnEvent", function(_, event, a1, a2, a3, a4)
    if event == "ADDON_LOADED" then
        if a1 ~= "FreewoodNetProbe" then return end
        G.FreewoodNetProbeDB = G.FreewoodNetProbeDB or {}
        DB = G.FreewoodNetProbeDB
        DB.target = DB.target or "Pinky Freewood"
        if G.C_ChatInfo and G.C_ChatInfo.RegisterAddonMessagePrefix then pcall(G.C_ChatInfo.RegisterAddonMessagePrefix, PREFIX)
        elseif G.RegisterAddonMessagePrefix then pcall(G.RegisterAddonMessagePrefix, PREFIX) end
        Watch()
        Log("START", "NetProbe 0.1.0 geladen. Ziel fuer den Ruf: " .. DB.target)
        return
    end
    if not DB then return end
    if event == "CHAT_MSG_ADDON" then
        -- Alle Addon-Nachrichten protokollieren (Praefix, Art, Absender), eigenes Praefix mit Text
        local text = Safe(a2)
        if a1 ~= PREFIX then
            DB.seen = DB.seen or {}
            local k = Safe(a1) .. " / " .. Safe(a3)
            DB.seen[k] = (DB.seen[k] or 0) + 1
            if DB.seen[k] == 1 then Log("FREMD", "neues Praefix " .. k .. " von " .. Safe(a4)) end
        else
            if burst and text:sub(1, 1) == "B" and text:find("|", 1, true) then burst.got = burst.got + 1
            else
                Log("EMPFANG", "Praefix=" .. Safe(a1) .. " Art=" .. Safe(a3) .. " von=" .. Safe(a4) .. " Text=" .. text:sub(1, 40))
            end
        end
        if a1 == PREFIX then
            if Safe(a3) == "CHANNEL" then echo.addon = true end
            if text == "CALL" and IsOwner(a4) and not answered then
                answered = true
                Log("CALL", "Ruf von " .. Safe(a4) .. " erhalten, antworte einmal per Fluestern an " .. DB.target)
                SendAddon("WHISPER", DB.target, "WHISPER an " .. DB.target)
            end
        end
    elseif event == "CHAT_MSG_WHISPER" then
        Log("EMPFANG", "NORMALES Fluestern (sichtbar) von " .. Safe(a2) .. ": " .. Safe(a1):sub(1, 30))
    elseif event == "CHAT_MSG_CHANNEL" then
        if Safe(a1) == "test" then echo.chat = true end
        if Safe(a1) == "test" then Log("EMPFANG", "Kanal-Chat test von " .. Safe(a2)) end
    elseif event == "CHAT_MSG_SYSTEM" or event == "UI_ERROR_MESSAGE" then
        local t = Safe(event == "UI_ERROR_MESSAGE" and a2 or a1)
        if t ~= "" and t ~= "nil" then
            Log("SYSTEM", t:sub(1, 100))
            if t:lower():find("wait") or t:lower():find("warten") then stopFlag = true end
        end
    end
end)

G.SLASH_FWNP1 = "/fwnp"
G.SlashCmdList["FWNP"] = function(msg)
    msg = (msg or ""):gsub("^%s+", "")
    local cmd, rest = msg:match("^(%S*)%s*(.*)$")
    cmd = cmd:lower()
    if cmd == "self" then TestSelf()
    elseif cmd == "call" then TestCall()
    elseif cmd == "club" then TestClub()
    elseif cmd == "send" then SendTo(rest)
    elseif cmd == "burst" then Burst(rest)
    elseif cmd == "list" then ListChannels(false)
    elseif cmd == "leave" then ListChannels(true)
    elseif cmd == "chan" then TestChan()
    elseif cmd == "types" then TestTypes()
    elseif cmd == "stop" then stopFlag = true print("FWNP: stop")
    elseif cmd == "clear" then DB.log = {} print("FWNP: Protokoll geleert")
    elseif cmd == "target" and rest ~= "" then DB.target = rest print("FWNP: Ziel = " .. rest)
    elseif cmd == "show" then
        local n = #(DB.log or {})
        for i = math.max(1, n - 24), n do print(DB.log[i]) end
    else
        print("FWNP: /fwnp self | call | chan | club | types | show | clear | stop | target <Name>")
    end
end
