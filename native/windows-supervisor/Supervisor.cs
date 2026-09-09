using System;
using System.Text;
using System.Runtime.InteropServices;
// Narrow development supervisor: spawn suspended, assign to Job, then resume.
// No credentials, routing, shell parsing, or process-name termination.
public static class Supervisor {
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFO { public int cb; public string reserved,desktop,title; public int x,y,xSize,ySize,xChars,yChars,fill,flags; public short show,reserved2; public IntPtr reservedPtr,input,output,error; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr process,thread;public uint pid,tid;}
 [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT {public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling;}
 [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS {public ulong a,b,c,d,e,f;}
 [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT {public BASIC_LIMIT basic;public IO_COUNTERS io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref EXTENDED_LIMIT info,int length);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string app,StringBuilder command,IntPtr pa,IntPtr ta,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO si,out PROCESS_INFORMATION pi);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int type);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out IntPtr target,uint access,bool inherit,uint options);
 static IntPtr Std(int n) {IntPtr h; if(!DuplicateHandle(GetCurrentProcess(),GetStdHandle(n),GetCurrentProcess(),out h,0,true,2))throw new Exception("DUPLICATE_STD_HANDLE:"+Marshal.GetLastWin32Error()); return h;}
 static string Quote(string text){var b=new StringBuilder("\"");int slashes=0;foreach(char c in text){if(c=='\\'){slashes++;continue;}if(c=='"')b.Append('\\',slashes*2+1);else b.Append('\\',slashes);b.Append(c);slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 public static int Main(string[] args) {
  if(args.Length<2){Console.Error.WriteLine("usage: supervisor <absolute cwd> <absolute executable> [args]");return 64;}
  IntPtr job=IntPtr.Zero;PROCESS_INFORMATION pi=new PROCESS_INFORMATION();STARTUPINFO si=new STARTUPINFO();
  try {
   if(!System.IO.Path.IsPathRooted(args[0])||!System.IO.Path.IsPathRooted(args[1]))return 64;
   job=CreateJobObject(IntPtr.Zero,null);if(job==IntPtr.Zero)throw new Exception("CREATE_JOB:"+Marshal.GetLastWin32Error());
   var info=new EXTENDED_LIMIT();info.basic.flags=0x2000; // KILL_ON_JOB_CLOSE, no breakaway.
   if(!SetInformationJobObject(job,9,ref info,Marshal.SizeOf(info)))throw new Exception("SET_JOB:"+Marshal.GetLastWin32Error());
   si.cb=Marshal.SizeOf(si);si.flags=0x100;si.input=Std(-10);si.output=Std(-11);si.error=Std(-12);
   var command=new StringBuilder();for(int i=1;i<args.Length;i++){if(i>1)command.Append(' ');command.Append(Quote(args[i]));}
   if(!CreateProcess(args[1],command,IntPtr.Zero,IntPtr.Zero,true,0x4|0x08000000,IntPtr.Zero,args[0],ref si,out pi))throw new Exception("CREATE_PROCESS:"+Marshal.GetLastWin32Error());
   if(!AssignProcessToJobObject(job,pi.process)){TerminateProcess(pi.process,125);throw new Exception("ASSIGN_JOB:"+Marshal.GetLastWin32Error());}
   if(ResumeThread(pi.thread)==0xffffffff){TerminateProcess(pi.process,125);throw new Exception("RESUME_FAILED");}
   WaitForSingleObject(pi.process,0xffffffff);uint code;GetExitCodeProcess(pi.process,out code);return unchecked((int)code);
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 125;}
  finally{if(job!=IntPtr.Zero)CloseHandle(job);if(pi.thread!=IntPtr.Zero)CloseHandle(pi.thread);if(pi.process!=IntPtr.Zero)CloseHandle(pi.process);if(si.input!=IntPtr.Zero)CloseHandle(si.input);if(si.output!=IntPtr.Zero)CloseHandle(si.output);if(si.error!=IntPtr.Zero)CloseHandle(si.error);}
 }
}
