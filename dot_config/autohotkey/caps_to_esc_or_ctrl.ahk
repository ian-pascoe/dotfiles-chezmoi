#Requires AutoHotkey v2.0
#SingleInstance Force
; AutoHotkey v2 Script
; Maps Caps Lock to:
; - Ctrl when held down with other keys
; - Esc when tapped alone

; Disable the default Caps Lock functionality
SetCapsLockState("AlwaysOff")

; Variable to track if CapsLock was used with other keys
capsUsedWithOtherKey := false

; CapsLock down - start acting as Ctrl
CapsLock::
{
    global capsUsedWithOtherKey
    capsUsedWithOtherKey := false
    
    ; Wait for CapsLock to be released
    KeyWait("CapsLock")
    
    ; If it wasn't used with other keys, send Esc
    if (!capsUsedWithOtherKey) {
        Send("{Esc}")
    }
}

; Map CapsLock + key combinations to Ctrl + key combinations
CapsLock & a::Send("^a")
CapsLock & b::Send("^b") 
CapsLock & c::Send("^c")
CapsLock & d::Send("^d")
CapsLock & e::Send("^e")
CapsLock & f::Send("^f")
CapsLock & g::Send("^g")
CapsLock & h::Send("^h")
CapsLock & i::Send("^i")
CapsLock & j::Send("^j")
CapsLock & k::Send("^k")
CapsLock & l::Send("^l")
CapsLock & m::Send("^m")
CapsLock & n::Send("^n")
CapsLock & o::Send("^o")
CapsLock & p::Send("^p")
CapsLock & q::Send("^q")
CapsLock & r::Send("^r")
CapsLock & s::Send("^s")
CapsLock & t::Send("^t")
CapsLock & u::Send("^u")
CapsLock & v::Send("^v")
CapsLock & w::Send("^w")
CapsLock & x::Send("^x")
CapsLock & y::Send("^y")
CapsLock & z::Send("^z")

CapsLock & 1::Send("^1")
CapsLock & 2::Send("^2")
CapsLock & 3::Send("^3")
CapsLock & 4::Send("^4")
CapsLock & 5::Send("^5")
CapsLock & 6::Send("^6")
CapsLock & 7::Send("^7")
CapsLock & 8::Send("^8")
CapsLock & 9::Send("^9")
CapsLock & 0::Send("^0")

CapsLock & Space::Send("^{Space}")
CapsLock & Enter::Send("^{Enter}")
CapsLock & Tab::Send("^{Tab}")
CapsLock & Backspace::Send("^{Backspace}")
CapsLock & Delete::Send("^{Delete}")
CapsLock & Insert::Send("^{Insert}")
CapsLock & Home::Send("^{Home}")
CapsLock & End::Send("^{End}")
CapsLock & PgUp::Send("^{PgUp}")
CapsLock & PgDn::Send("^{PgDn}")
CapsLock & Up::Send("^{Up}")
CapsLock & Down::Send("^{Down}")
CapsLock & Left::Send("^{Left}")
CapsLock & Right::Send("^{Right}")

CapsLock & F1::Send("^{F1}")
CapsLock & F2::Send("^{F2}")
CapsLock & F3::Send("^{F3}")
CapsLock & F4::Send("^{F4}")
CapsLock & F5::Send("^{F5}")
CapsLock & F6::Send("^{F6}")
CapsLock & F7::Send("^{F7}")
CapsLock & F8::Send("^{F8}")
CapsLock & F9::Send("^{F9}")
CapsLock & F10::Send("^{F10}")
CapsLock & F11::Send("^{F11}")
CapsLock & F12::Send("^{F12}")

CapsLock & `;::Send("^;")
CapsLock & '::Send("^'")
CapsLock & ,::Send("^,")
CapsLock & .::Send("^.")
CapsLock & /::Send("^/")
CapsLock & \::Send("^\")
CapsLock & [::Send("^[")
CapsLock & ]::Send("^]")
CapsLock & -::Send("^-")
CapsLock & =::Send("^=")
CapsLock & `::Send("^``")

; Mark that CapsLock was used with another key for all the above combinations
{
    global capsUsedWithOtherKey
    capsUsedWithOtherKey := true
}
