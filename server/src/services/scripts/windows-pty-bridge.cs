using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

// Console bridge for local Claude and Codex sign-in. Windows has no Python pty
// module, and both CLIs stay silent unless their stdout is a real console.
// This process copies its own stdin and stdout to a ConPTY session. It writes
// nothing of its own to either stream. Exit 122 means the console could not be
// created. Exit 123 means the provider command could not be started.
internal static class WindowsPtyBridge
{
    private const int StdInputHandle = -10;
    private const int StdOutputHandle = -11;
    private const uint ExtendedStartupInfoPresent = 0x00080000;
    private const uint CreateSuspended = 0x00000004;
    private const int ProcThreadAttributePseudoconsole = 0x00020016;
    private const int JobObjectExtendedLimitInformationClass = 9;
    private const uint JobObjectLimitKillOnJobClose = 0x2000;
    private const uint Infinite = 0xFFFFFFFF;

    private static int Main(string[] args)
    {
        if (args.Length < 2) return 123;
        string application;
        string commandLine;
        try
        {
            if (!TryBuildCommand(args, out application, out commandLine)) return 123;
        }
        catch
        {
            return 123;
        }

        if (args[0] == "screen") return RunRealConsole(application, commandLine);

        IntPtr inputRead, inputWrite, outputRead, outputWrite;
        if (!CreateConsolePipes(out inputRead, out inputWrite, out outputRead, out outputWrite)) return 122;
        var size = new Coord { X = 120, Y = 30 };
        IntPtr console;
        int created = CreatePseudoConsole(size, inputRead, outputWrite, 0, out console);
        CloseHandle(inputRead);
        CloseHandle(outputWrite);
        if (created != 0) return 122;

        IntPtr attributes = IntPtr.Zero;
        IntPtr consolePointer = IntPtr.Zero;
        IntPtr job = IntPtr.Zero;
        var processInfo = new ProcessInformation();
        try
        {
            attributes = CreateAttributeList(console, out consolePointer);
            if (attributes == IntPtr.Zero) return 122;
            var startup = new StartupInfoEx();
            startup.StartupInfo.cb = Marshal.SizeOf(typeof(StartupInfoEx));
            startup.lpAttributeList = attributes;
            if (!CreateProcessW(null, commandLine, IntPtr.Zero, IntPtr.Zero, false,
                ExtendedStartupInfoPresent | CreateSuspended, IntPtr.Zero, null, ref startup, out processInfo))
                return 123;
            job = CreateKillOnCloseJob();
            if (job != IntPtr.Zero) AssignProcessToJobObject(job, processInfo.hProcess);
            ResumeThread(processInfo.hThread);
            // Some console programs, including Claude Code, do not flush their
            // first screen until the console reports a size change.
            IntPtr consoleForResize = console;
            var resize = new Thread(() =>
            {
                Thread.Sleep(200);
                ResizePseudoConsole(consoleForResize, new Coord { X = 120, Y = 32 });
            }) { IsBackground = true };
            resize.Start();

            var output = new Thread(() => Copy(outputRead, GetStdHandle(StdOutputHandle))) { IsBackground = true };
            var input = new Thread(() => Copy(GetStdHandle(StdInputHandle), inputWrite)) { IsBackground = true };
            output.Start();
            input.Start();
            WaitForSingleObject(processInfo.hProcess, Infinite);
            ClosePseudoConsole(console);
            console = IntPtr.Zero;
            output.Join();
            uint code;
            return GetExitCodeProcess(processInfo.hProcess, out code) ? unchecked((int)code) : 123;
        }
        finally
        {
            if (console != IntPtr.Zero) ClosePseudoConsole(console);
            if (attributes != IntPtr.Zero)
            {
                DeleteProcThreadAttributeList(attributes);
                Marshal.FreeHGlobal(attributes);
            }
            if (consolePointer != IntPtr.Zero) Marshal.FreeHGlobal(consolePointer);
            if (processInfo.hThread != IntPtr.Zero) CloseHandle(processInfo.hThread);
            if (processInfo.hProcess != IntPtr.Zero) CloseHandle(processInfo.hProcess);
            if (job != IntPtr.Zero) CloseHandle(job);
            CloseHandle(inputWrite);
            CloseHandle(outputRead);
        }
    }

    // Claude Code draws its sign-in screen with the Windows console API. A
    // pseudoconsole receives the clear and the title, and none of the text.
    // A real console keeps that text in the screen buffer, which this process
    // reads and forwards.
    private static int RunRealConsole(string application, string commandLine)
    {
        IntPtr savedIn = DuplicateStd(StdInputHandle);
        IntPtr savedOut = DuplicateStd(StdOutputHandle);
        if (savedIn == IntPtr.Zero || savedOut == IntPtr.Zero) return 122;
        FreeConsole();

        var startup = new StartupInfoEx();
        startup.StartupInfo.cb = Marshal.SizeOf(typeof(StartupInfo));
        startup.StartupInfo.dwFlags = 1;
        startup.StartupInfo.wShowWindow = 1;
        var processInfo = new ProcessInformation();
        if (!CreateProcessW(application, commandLine, IntPtr.Zero, IntPtr.Zero, false,
            0x00000010 | CreateSuspended, IntPtr.Zero, null, ref startup, out processInfo))
            return 123;
        IntPtr job = CreateKillOnCloseJob();
        if (job != IntPtr.Zero) AssignProcessToJobObject(job, processInfo.hProcess);
        ResumeThread(processInfo.hThread);

        IntPtr consoleIn = IntPtr.Zero;
        IntPtr consoleOut = IntPtr.Zero;
        // Redirected standard handles stay pointed at the pipes. CONOUT$/CONIN$
        // are the console attached by AttachConsole.
        for (int attempt = 0; attempt < 50 && consoleOut == IntPtr.Zero; attempt++)
        {
            if (AttachConsole((uint)processInfo.dwProcessId))
            {
                consoleIn = CreateFile("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                consoleOut = CreateFile("CONOUT$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                if (consoleOut == IntPtr.Zero || consoleOut == new IntPtr(-1) || consoleIn == IntPtr.Zero || consoleIn == new IntPtr(-1))
                {
                    FreeConsole();
                    consoleIn = IntPtr.Zero;
                    consoleOut = IntPtr.Zero;
                }
            }
            else Thread.Sleep(100);
        }
        var keys = new Thread(() => WriteKeys(savedIn, () => consoleIn)) { IsBackground = true };
        keys.Start();
        uint lastPid = (uint)processInfo.dwProcessId;
        // The .local\bin launcher exits after it starts the real claude.exe.
        // Stay attached to whichever console in the job is still alive.
        while (true)
        {
            uint[] pids = job == IntPtr.Zero ? null : JobProcessIds(job);
            if (pids != null && pids.Length == 0) break;
            if (pids == null) pids = new[] { lastPid };
            if (consoleOut == IntPtr.Zero || Array.IndexOf(pids, lastPid) < 0)
            {
                FreeConsole();
                consoleIn = IntPtr.Zero;
                consoleOut = IntPtr.Zero;
                foreach (uint pid in pids)
                {
                    if (!AttachConsole(pid)) continue;
                    IntPtr input = CreateFile("CONIN$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                    IntPtr output = CreateFile("CONOUT$", 0xC0000000, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
                    if (output == IntPtr.Zero || output == new IntPtr(-1) || input == IntPtr.Zero || input == new IntPtr(-1))
                    {
                        FreeConsole();
                        continue;
                    }
                    consoleIn = input;
                    consoleOut = output;
                    lastPid = pid;
                    break;
                }
            }
            if (consoleOut != IntPtr.Zero) ReadScreenOnce(consoleOut, savedOut);
            Thread.Sleep(200);
            if (job == IntPtr.Zero && WaitForSingleObject(processInfo.hProcess, 0) != 258) break;
        }
        uint code;
        int exit = GetExitCodeProcess(processInfo.hProcess, out code) ? unchecked((int)code) : 0;
        if (job != IntPtr.Zero) CloseHandle(job);
        CloseHandle(processInfo.hThread);
        CloseHandle(processInfo.hProcess);
        return exit;
    }

    private static uint[] JobProcessIds(IntPtr job)
    {
        int bytes = 16 + (8 * 32);
        IntPtr memory = Marshal.AllocHGlobal(bytes);
        try
        {
            uint returned;
            if (!QueryInformationJobObject(job, 3, memory, (uint)bytes, out returned)) return null;
            uint count = (uint)Marshal.ReadInt32(memory, 4);
            if (count > 32) count = 32;
            var ids = new uint[count];
            for (int i = 0; i < count; i++) ids[i] = (uint)Marshal.ReadInt64(memory, 8 + (i * 8));
            return ids;
        }
        finally
        {
            Marshal.FreeHGlobal(memory);
        }
    }

    private static IntPtr DuplicateStd(int handleKind)
    {
        IntPtr copy;
        bool ok = DuplicateHandle(GetCurrentProcess(), GetStdHandle(handleKind), GetCurrentProcess(), out copy, 0, false, 2);
        return ok ? copy : IntPtr.Zero;
    }

    private static void ReadScreen(IntPtr consoleOut, IntPtr savedOut, IntPtr process)
    {
        while (WaitForSingleObject(process, 200) == 258) ReadScreenOnce(consoleOut, savedOut);
    }

    private static string lastScreen = "";

    private static void ReadScreenOnce(IntPtr consoleOut, IntPtr savedOut)
    {
        ConsoleScreenBufferInfo info;
        if (!GetConsoleScreenBufferInfo(consoleOut, out info)) return;
        int width = info.dwSize.X;
        int height = info.dwSize.Y;
        if (width < 1 || height < 1) return;
        if (height > 80) height = 80;
        var text = new StringBuilder();
        var row = new char[width];
        for (short y = 0; y < height; y++)
        {
            uint read;
            if (!ReadConsoleOutputCharacter(consoleOut, row, (uint)width, new Coord { X = 0, Y = y }, out read) || read == 0) continue;
            text.AppendLine(new string(row, 0, (int)read).TrimEnd());
        }
        string screen = text.ToString();
        if (screen == lastScreen) return;
        lastScreen = screen;
        byte[] bytes = Encoding.UTF8.GetBytes(screen);
        uint written;
        WriteFile(savedOut, bytes, (uint)bytes.Length, out written, IntPtr.Zero);
    }

    private static void WriteKeys(IntPtr savedIn, System.Func<IntPtr> consoleIn)
    {
        var buffer = new byte[256];
        uint read;
        while (ReadFile(savedIn, buffer, (uint)buffer.Length, out read, IntPtr.Zero) && read > 0)
        {
            IntPtr input = consoleIn();
            if (input == IntPtr.Zero) continue;
            string text = Encoding.UTF8.GetString(buffer, 0, (int)read);
            foreach (char character in text)
            {
                if (character == '\n') continue;
                short key = character == '\r' ? (short)13 : (short)character;
                short virtualKey = character == '\r' ? (short)0x0D : (short)0;
                SendKey(input, key, virtualKey, true);
                SendKey(input, key, virtualKey, false);
            }
        }
    }

    private static void SendKey(IntPtr consoleIn, short character, short virtualKey, bool down)
    {
        var record = new InputRecord
        {
            EventType = 1,
            KeyEvent = new KeyEventRecord
            {
                bKeyDown = down ? 1 : 0,
                wRepeatCount = 1,
                wVirtualKeyCode = virtualKey,
                UnicodeChar = character,
            },
        };
        uint written;
        WriteConsoleInput(consoleIn, new[] { record }, 1, out written);
    }

    private static bool TryBuildCommand(string[] args, out string application, out string commandLine)
    {
        application = null;
        commandLine = null;
        string mode = args[0];
        string target = args[1];
        if (mode == "exe" || mode == "screen")
        {
            application = target;
            commandLine = JoinCommand(target, args, 2);
            return true;
        }
        if (mode == "node")
        {
            application = target;
            commandLine = JoinCommand(target, args, 2);
            return true;
        }
        if (mode == "cmd")
        {
            application = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            var inner = new StringBuilder();
            inner.Append(Quote(target));
            for (int i = 2; i < args.Length; i++)
            {
                inner.Append(' ');
                inner.Append(Quote(args[i]));
            }
            commandLine = Quote(application) + " /d /s /c \"" + inner + "\"";
            return true;
        }
        if (mode == "ps1")
        {
            application = System.IO.Path.Combine(Environment.SystemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
            var tail = new StringBuilder();
            tail.Append(Quote(application));
            tail.Append(" -NoProfile -File ");
            tail.Append(Quote(target));
            for (int i = 2; i < args.Length; i++)
            {
                tail.Append(' ');
                tail.Append(Quote(args[i]));
            }
            commandLine = tail.ToString();
            return true;
        }
        return false;
    }

    private static string JoinCommand(string application, string[] args, int from)
    {
        var line = new StringBuilder(Quote(application));
        for (int i = from; i < args.Length; i++)
        {
            line.Append(' ');
            line.Append(Quote(args[i]));
        }
        return line.ToString();
    }

    private static string Quote(string value)
    {
        if (value.Length == 0) return "\"\"";
        if (value.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return value;
        var quoted = new StringBuilder();
        quoted.Append('"');
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"')
            {
                quoted.Append('\\', slashes * 2 + 1);
                quoted.Append('"');
                slashes = 0;
                continue;
            }
            if (slashes > 0) { quoted.Append('\\', slashes); slashes = 0; }
            quoted.Append(character);
        }
        if (slashes > 0) quoted.Append('\\', slashes * 2);
        quoted.Append('"');
        return quoted.ToString();
    }

    private static bool CreateConsolePipes(out IntPtr inputRead, out IntPtr inputWrite, out IntPtr outputRead, out IntPtr outputWrite)
    {
        var security = new SecurityAttributes
        {
            nLength = Marshal.SizeOf(typeof(SecurityAttributes)),
            bInheritHandle = 1,
        };
        inputRead = inputWrite = outputRead = outputWrite = IntPtr.Zero;
        return CreatePipe(out inputRead, out inputWrite, ref security, 0)
            && CreatePipe(out outputRead, out outputWrite, ref security, 0);
    }

    private static IntPtr CreateAttributeList(IntPtr console, out IntPtr consolePointer)
    {
        consolePointer = IntPtr.Zero;
        var size = IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
        if (size == IntPtr.Zero) return IntPtr.Zero;
        IntPtr list = Marshal.AllocHGlobal(size);
        if (!InitializeProcThreadAttributeList(list, 1, 0, ref size)) return IntPtr.Zero;
        // The pseudoconsole attribute value is the HPCON handle itself.
        if (!UpdateProcThreadAttribute(list, 0, (IntPtr)ProcThreadAttributePseudoconsole, console,
            (IntPtr)IntPtr.Size, IntPtr.Zero, IntPtr.Zero))
            return IntPtr.Zero;
        return list;
    }

    private static IntPtr CreateKillOnCloseJob()
    {
        IntPtr job = CreateJobObjectW(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return IntPtr.Zero;
        var limits = new JobObjectExtendedLimitInformation();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        int length = Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
        IntPtr memory = Marshal.AllocHGlobal(length);
        try
        {
            Marshal.StructureToPtr(limits, memory, false);
            if (!SetInformationJobObject(job, JobObjectExtendedLimitInformationClass, memory, (uint)length))
            {
                CloseHandle(job);
                return IntPtr.Zero;
            }
        }
        finally
        {
            Marshal.FreeHGlobal(memory);
        }
        return job;
    }

    private static void Copy(IntPtr source, IntPtr destination)
    {
        var buffer = new byte[4096];
        uint read;
        while (ReadFile(source, buffer, (uint)buffer.Length, out read, IntPtr.Zero) && read > 0)
        {
            uint written;
            if (!WriteFile(destination, buffer, read, out written, IntPtr.Zero)) break;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Coord
    {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        public int bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int cb;
        public IntPtr lpReserved;
        public IntPtr lpDesktop;
        public IntPtr lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfoEx
    {
        public StartupInfo StartupInfo;
        public IntPtr lpAttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInformation
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SmallRect
    {
        public short Left;
        public short Top;
        public short Right;
        public short Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct ConsoleScreenBufferInfo
    {
        public Coord dwSize;
        public Coord dwCursorPosition;
        public short wAttributes;
        public SmallRect srWindow;
        public Coord dwMaximumWindowSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KeyEventRecord
    {
        public int bKeyDown;
        public short wRepeatCount;
        public short wVirtualKeyCode;
        public short wVirtualScanCode;
        public short UnicodeChar;
        public int dwControlKeyState;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputRecord
    {
        [FieldOffset(0)] public ushort EventType;
        [FieldOffset(4)] public KeyEventRecord KeyEvent;
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length, out uint returned);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(string fileName, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetConsoleScreenBufferInfo(IntPtr consoleOutput, out ConsoleScreenBufferInfo info);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ReadConsoleOutputCharacter(IntPtr consoleOutput, [Out] char[] buffer, uint length, Coord coord, out uint read);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteConsoleInput(IntPtr consoleInput, InputRecord[] buffer, uint length, out uint written);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe, ref SecurityAttributes lpPipeAttributes, uint nSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int CreatePseudoConsole(Coord size, IntPtr hInput, IntPtr hOutput, uint dwFlags, out IntPtr phPc);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void ClosePseudoConsole(IntPtr hPc);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern int ResizePseudoConsole(IntPtr hPc, Coord size);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr lpAttributeList, int dwAttributeCount, int dwFlags, ref IntPtr lpSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr lpAttributeList, uint dwFlags, IntPtr attribute, IntPtr lpValue, IntPtr cbSize, IntPtr lpPreviousValue, IntPtr lpReturnSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern void DeleteProcThreadAttributeList(IntPtr lpAttributeList);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(string lpApplicationName, string lpCommandLine, IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles, uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory, ref StartupInfoEx lpStartupInfo, out ProcessInformation lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr hProcess, out uint lpExitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObjectW(IntPtr lpJobAttributes, string lpName);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr hJob, int jobObjectInfoClass, IntPtr lpJobObjectInfo, uint cbJobObjectInfoLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);
}
