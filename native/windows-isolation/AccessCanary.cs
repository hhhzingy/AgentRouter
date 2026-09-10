using System;
using System.IO;
using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
// Offline access-check probe only. This is not a Harness sandbox or SG1-SG3 certification.
public static class TokenCanary {
 [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr existing,uint flags,uint disableCount,IntPtr disable,uint deleteCount,IntPtr delete,uint restrictCount,ref SID_AND_ATTRIBUTES restrict,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool ImpersonateLoggedOnUser(IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool RevertToSelf();
 [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static bool Denied(Action action) { try { action(); return false; } catch(UnauthorizedAccessException) { return true; } }
 public static int Main(string[] args) {
  if(args.Length==1 && args[0]=="--broker") { System.Threading.Thread.Sleep(15000);return 0; }
  if(args.Length!=1 || !Path.IsPathRooted(args[0]) || Directory.Exists(args[0])) return 64;
  IntPtr original=IntPtr.Zero,restricted=IntPtr.Zero,sidMemory=IntPtr.Zero;Process broker=null;bool impersonating=false;
  string stage="create-canary-directory";
  try {
   Directory.CreateDirectory(args[0]);
   var owner=WindowsIdentity.GetCurrent().User;
   var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.SetOwner(owner);
   acl.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
   stage="protect-canary-acl";Directory.SetAccessControl(args[0],acl);
   var canary=Path.Combine(args[0],"canary.txt");File.WriteAllText(canary,Guid.NewGuid().ToString("N"));
   stage="open-own-token";if(!OpenProcessToken(GetCurrentProcess(),0x000B,out original))throw new Exception("OPEN_TOKEN:"+Marshal.GetLastWin32Error());
   var sid=new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid,null);var bytes=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes,0);sidMemory=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,sidMemory,bytes.Length);
   var restrict=new SID_AND_ATTRIBUTES();restrict.Sid=sidMemory;
   stage="restrict-own-token";if(!CreateRestrictedToken(original,1,0,IntPtr.Zero,0,IntPtr.Zero,1,ref restrict,out restricted))throw new Exception("RESTRICT_TOKEN:"+Marshal.GetLastWin32Error());
   stage="start-fake-broker";broker=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--broker"){UseShellExecute=false,CreateNoWindow=true});
   stage="impersonate-restricted-token";if(!ImpersonateLoggedOnUser(restricted))throw new Exception("IMPERSONATE:"+Marshal.GetLastWin32Error());impersonating=true;
   stage="canary-access-checks";bool readDenied=Denied(()=>File.ReadAllText(canary));
   bool writeDenied=Denied(()=>File.AppendAllText(canary,"test"));
   bool aclDenied=Denied(()=>Directory.SetAccessControl(args[0],acl));
   stage="fake-broker-memory-access-check";IntPtr memory=OpenProcess(0x0010,false,broker.Id);bool memoryDenied=memory==IntPtr.Zero;if(memory!=IntPtr.Zero)CloseHandle(memory);
   stage="restricted-token-query";bool restrictedFlag=IsTokenRestricted(restricted);
   if(!RevertToSelf())Environment.FailFast("REVERT_FAILED");impersonating=false;
   Console.WriteLine("{\"restrictedToken\":"+restrictedFlag.ToString().ToLower()+",\"canaryReadDenied\":"+readDenied.ToString().ToLower()+",\"canaryWriteDenied\":"+writeDenied.ToString().ToLower()+",\"aclChangeDenied\":"+aclDenied.ToString().ToLower()+",\"brokerMemoryReadDenied\":"+memoryDenied.ToString().ToLower()+",\"scope\":\"TOKEN_ACCESS_CHECK_ONLY\",\"fullIsolationCertified\":false}");
   return restrictedFlag&&readDenied&&writeDenied&&aclDenied&&memoryDenied ? 0:1;
  }catch(Exception e){Console.Error.WriteLine(stage+":"+e.GetType().Name);return 125;}
  finally {if(impersonating && !RevertToSelf())Environment.FailFast("REVERT_FAILED");if(broker!=null){if(!broker.HasExited)broker.Kill();broker.WaitForExit();broker.Dispose();}if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(original!=IntPtr.Zero)CloseHandle(original);if(sidMemory!=IntPtr.Zero)Marshal.FreeHGlobal(sidMemory);}
 }
}
