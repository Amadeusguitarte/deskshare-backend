Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Win32Input {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@

# Mouse Flags
$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$MOUSEEVENTF_RIGHTDOWN = 0x0008
$MOUSEEVENTF_RIGHTUP = 0x0010
$MOUSEEVENTF_WHEEL = 0x0800

# Keyboard Flags
$KEYEVENTF_KEYUP = 0x0002

# Disable error output
$ErrorActionPreference = 'SilentlyContinue'

while ($true) {
    $line = [Console]::In.ReadLine()
    if ($line -eq "EXIT") { break }
    
    if ($line -match "^MOVE (\d+) (\d+)") {
        [Win32Input]::SetCursorPos($matches[1], $matches[2])
    }
    elseif ($line -match "^CLICK (LEFT|RIGHT) (DOWN|UP)") {
        $flag = 0
        if ($matches[1] -eq "LEFT") {
            if ($matches[2] -eq "DOWN") { $flag = $MOUSEEVENTF_LEFTDOWN } else { $flag = $MOUSEEVENTF_LEFTUP }
        }
        else {
            if ($matches[2] -eq "DOWN") { $flag = $MOUSEEVENTF_RIGHTDOWN } else { $flag = $MOUSEEVENTF_RIGHTUP }
        }
        [Win32Input]::mouse_event($flag, 0, 0, 0, 0)
    }
    elseif ($line -match "^SCROLL (-?\d+)") {
        [Win32Input]::mouse_event($MOUSEEVENTF_WHEEL, 0, 0, $matches[1], 0)
    }
    elseif ($line -match "^KEY (\d+) (DOWN|UP)") {
        $flags = 0
        if ($matches[2] -eq "UP") { $flags = $KEYEVENTF_KEYUP }
        [Win32Input]::keybd_event([byte]$matches[1], 0, $flags, 0)
    }
}
