local hyper = { "ctrl", "alt", "cmd" }
local hotkeyDocs = {}
local log = hs.logger.new("init", "info")

local function notify(message)
  hs.alert.show(message, 1.2)
end

local function bind(mods, key, description, fn)
  table.insert(hotkeyDocs, {
    combo = table.concat(mods, "+") .. "+" .. key,
    description = description,
  })
  hs.hotkey.bind(mods, key, fn)
end

local function showCheatsheet()
  table.sort(hotkeyDocs, function(a, b)
    return a.combo < b.combo
  end)

  local lines = { "Hammerspoon shortcuts" }
  for _, item in ipairs(hotkeyDocs) do
    table.insert(lines, string.format("%s  -  %s", item.combo, item.description))
  end
  hs.alert.show(table.concat(lines, "\n"), 4)
end

local function reloadConfig(files)
  for _, file in ipairs(files) do
    if file:sub(-4) == ".lua" then
      hs.reload()
      return
    end
  end
end

local reloader = hs.pathwatcher.new(hs.configdir, reloadConfig)
reloader:start()

local appChoices = {
  { text = "Ghostty", subText = "Terminal" },
  { text = "Safari", subText = "Browser" },
  { text = "Google Chrome", subText = "Browser" },
  { text = "Slack", subText = "Messaging" },
  { text = "Neovide", subText = "Editor" },
  { text = "Finder", subText = "Files" },
}

local appChooser = hs.chooser.new(function(choice)
  if not choice then
    return
  end
  hs.application.launchOrFocus(choice.text)
end)
appChooser:choices(appChoices)
appChooser:placeholderText("Launch or focus an app")

local clipboardHistory = {}
local maxClipboardItems = 30
local lastChangeCount = hs.pasteboard.changeCount()

local function pushClipboard(text)
  if text == "" then
    return
  end

  if clipboardHistory[1] == text then
    return
  end

  for i = #clipboardHistory, 1, -1 do
    if clipboardHistory[i] == text then
      table.remove(clipboardHistory, i)
      break
    end
  end

  table.insert(clipboardHistory, 1, text)
  if #clipboardHistory > maxClipboardItems then
    table.remove(clipboardHistory)
  end
end

hs.timer.doEvery(0.8, function()
  local currentChangeCount = hs.pasteboard.changeCount()
  if currentChangeCount == lastChangeCount then
    return
  end

  lastChangeCount = currentChangeCount
  local text = hs.pasteboard.getContents()
  if text then
    pushClipboard(text)
  end
end)

local clipboardChooser = hs.chooser.new(function(choice)
  if not choice then
    return
  end
  hs.pasteboard.setContents(choice.text)
  notify("Copied from history")
end)
clipboardChooser:placeholderText("Clipboard history")

local function showClipboardChooser()
  local choices = {}
  for _, value in ipairs(clipboardHistory) do
    local compact = value:gsub("\n", " ")
    table.insert(choices, {
      text = value,
      subText = compact:sub(1, 120),
    })
  end

  clipboardChooser:choices(choices)
  clipboardChooser:show()
end

local function toggleCaffeine()
  local active = hs.caffeinate.get("displayIdle")
  hs.caffeinate.set("displayIdle", not active)
  notify(not active and "Caffeine: ON" or "Caffeine: OFF")
end

local function setCaffeineEnabled(enabled, reason)
  local active = hs.caffeinate.get("displayIdle")
  if active == enabled then
    return
  end

  hs.caffeinate.set("displayIdle", enabled)
  if reason then
    notify(enabled and ("Caffeine: ON (" .. reason .. ")") or ("Caffeine: OFF (" .. reason .. ")"))
    return
  end

  notify(enabled and "Caffeine: ON" or "Caffeine: OFF")
end

local function syncCaffeineWithPower(showNotification)
  local source = hs.battery.powerSource()
  local onACPower = source == "AC Power"
  setCaffeineEnabled(onACPower, showNotification and source or nil)
end

local function toggleMicMute()
  local input = hs.audiodevice.defaultInputDevice()
  if not input then
    notify("No input device found")
    return
  end

  local muted = input:inputMuted()
  input:setInputMuted(not muted)
  notify(not muted and "Mic: Muted" or "Mic: Live")
end

local function toggleDarkMode()
  local ok, _, result = hs.osascript.applescript([[
    tell application "System Events"
      tell appearance preferences
        set dark mode to not dark mode
        return dark mode
      end tell
    end tell
  ]])

  if not ok then
    notify("Dark mode toggle failed")
    return
  end

  notify(result and "Appearance: Dark" or "Appearance: Light")
end

local function openDotfiles()
  hs.execute('open "' .. os.getenv("HOME") .. '/.dotfiles"')
end

bind(hyper, "R", "Reload config", hs.reload)
bind(hyper, "A", "App launcher", function()
  appChooser:show()
end)
bind(hyper, "V", "Clipboard history", showClipboardChooser)
bind(hyper, "C", "Toggle caffeine", toggleCaffeine)
bind(hyper, "M", "Toggle microphone mute", toggleMicMute)
bind(hyper, "D", "Toggle dark mode", toggleDarkMode)
bind(hyper, "/", "Show shortcut cheatsheet", showCheatsheet)
bind(hyper, ".", "Toggle Hammerspoon console", hs.toggleConsole)
bind(hyper, "O", "Open dotfiles folder", openDotfiles)

local powerWatcher = hs.battery.watcher.new(function()
  syncCaffeineWithPower(true)
end)
powerWatcher:start()
syncCaffeineWithPower(false)

log.i("config loaded")
notify("Hammerspoon ready")
