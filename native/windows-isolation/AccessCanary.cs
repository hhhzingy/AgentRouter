using System;
using System.IO;
using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.InteropServices;
using System.ComponentModel;
// Offline diagnostic only. Thread impersonation is not a process sandbox.
public static class TokenCanary {
 [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
 [StructLayout(LayoutKind.Sequential)] struct SID_PAIR {public SID_AND_ATTRIBUTES First,Second;}
 static bool systemObjectControl;
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr data,int length,out int needed);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool CreateRestrictedToken(IntPtr existing,uint flags,uint disableCount,IntPtr disable,uint deleteCount,IntPtr delete,uint restrictCount,ref SID_PAIR restrict,out IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool ImpersonateLoggedOnUser(IntPtr token);
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool RevertToSelf();
 [DllImport("advapi32.dll",SetLastError=true)] static extern bool SetTokenInformation(IntPtr token,int kind,IntPtr data,int length);
 [DllImport("advapi32.dll")] static extern bool IsTokenRestricted(IntPtr token);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO {public int cb;public string reserved,desktop,title;public int x,y,xSize,ySize,xChars,yChars,fill;public uint flags;public short show,cbReserved;public IntPtr reserved2,stdIn,stdOut,stdErr;}
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("advapi32.dll",SetLastError=true,CharSet=CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr token,string app,System.Text.StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string cwd,ref STARTUPINFO startup,out PROCESS_INFORMATION process);
 [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr handle,uint code);
  [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES {public int length;public IntPtr descriptor;public int inherit;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateWindowStation(string name,uint flags,uint access,ref SECURITY_ATTRIBUTES security);
 [DllImport("user32.dll",SetLastError=true)] static extern IntPtr GetProcessWindowStation();
 [DllImport("user32.dll",SetLastError=true)] static extern bool SetProcessWindowStation(IntPtr station);
 [DllImport("user32.dll",SetLastError=true)] static extern bool CloseWindowStation(IntPtr station);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr devmode,uint flags,uint access,ref SECURITY_ATTRIBUTES security);
 [DllImport("user32.dll",SetLastError=true)] static extern bool CloseDesktop(IntPtr desktop);
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetUserObjectInformation(IntPtr handle,int index,System.Text.StringBuilder value,int length,out int needed);
 static void PrivateDesktopPrimary(IntPtr token,string workspace,string secret) {
  // CREATE_ONLY prevents opening or modifying an existing station. No visible desktop switch is performed.
  IntPtr originalStation=GetProcessWindowStation(),station=IntPtr.Zero,desktop=IntPtr.Zero,descriptor=IntPtr.Zero;
  try {
   var sd=new RawSecurityDescriptor("D:(A;;GA;;;"+WindowsIdentity.GetCurrent().User.Value+")(A;;GA;;;"+DiagnosticSid().Value+")");var raw=new byte[sd.BinaryLength];sd.GetBinaryForm(raw,0);descriptor=Marshal.AllocHGlobal(raw.Length);Marshal.Copy(raw,0,descriptor,raw.Length);
   var sa=new SECURITY_ATTRIBUTES();sa.length=Marshal.SizeOf(sa);sa.descriptor=descriptor;
   station=CreateWindowStation("AgentRouterDummy"+Guid.NewGuid().ToString("N"),1,0x10000000,ref sa);if(station==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
   Console.WriteLine("{\"privateStationCreated\":true}");
   if(!SetProcessWindowStation(station))throw new Win32Exception(Marshal.GetLastWin32Error());
   var stationName=new System.Text.StringBuilder(1024);int needed;if(!GetUserObjectInformation(station,2,stationName,2048,out needed))throw new Win32Exception(Marshal.GetLastWin32Error());
   string desktopName="AgentRouterDummy"+Guid.NewGuid().ToString("N");desktop=CreateDesktop(desktopName,IntPtr.Zero,IntPtr.Zero,0,0x10000000,ref sa);if(desktop==IntPtr.Zero)throw new Win32Exception(Marshal.GetLastWin32Error());
   Console.WriteLine("{\"privateDesktopCreated\":true}");
   Primary(token,workspace,secret,stationName.ToString()+"\\"+desktopName);
  }finally{if(originalStation!=IntPtr.Zero&&!SetProcessWindowStation(originalStation))Environment.FailFast("RESTORE_STATION_FAILED");if(desktop!=IntPtr.Zero)CloseDesktop(desktop);if(station!=IntPtr.Zero)CloseWindowStation(station);if(descriptor!=IntPtr.Zero)Marshal.FreeHGlobal(descriptor);}
 }
 static int Child(string[] args) {
  var deadline=new System.Threading.Timer(_=>Environment.Exit(124),null,10000,System.Threading.Timeout.Infinite);
  try {
   var path=args[1];var secret=args[2];int depth=int.Parse(args[3]);var owner=WindowsIdentity.GetCurrent().User;
   string dummy=Path.Combine(path,"child-"+depth+".txt");File.WriteAllText(dummy,"dummy");Require(File.ReadAllText(dummy)=="dummy");
   Require(Denied(()=>File.ReadAllText(Path.Combine(secret,"canary.txt"))));Require(Denied(()=>File.AppendAllText(Path.Combine(secret,"canary.txt"),"dummy")));
   var attack=new DirectorySecurity();attack.SetAccessRuleProtection(true,false);attack.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Require(Denied(()=>Directory.SetAccessControl(secret,attack)));
   foreach(System.Collections.DictionaryEntry e in Environment.GetEnvironmentVariables())Require(string.Equals((string)e.Key,"SystemRoot",StringComparison.OrdinalIgnoreCase));
   if(depth==0){var start=new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--child \""+path+"\" \""+secret+"\" 1"){UseShellExecute=false,CreateNoWindow=true};start.EnvironmentVariables.Clear();start.EnvironmentVariables["SystemRoot"]=Environment.GetEnvironmentVariable("SystemRoot");using(var grandchild=Process.Start(start)){if(!grandchild.WaitForExit(5000)){grandchild.Kill();return 124;}Require(grandchild.ExitCode==0);}}
   File.WriteAllText(Path.Combine(path,"child-"+depth+"-pass.json"),"{\"dummyReadWrite\":true,\"canaryReadDenied\":true,\"canaryWriteDenied\":true,\"canaryAclDenied\":true,\"environmentAllowlistOnly\":true}");return 0;
  }catch{return 1;}finally{deadline.Dispose();}
 }
 static void Primary(IntPtr token,string workspace,string secret,string desktop=null,bool nativeControl=false,bool nodeControl=false) {
  string exe=nodeControl?@"D:\Software\nodejs\node.exe":nativeControl?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"cmd.exe"):Process.GetCurrentProcess().MainModule.FileName;var si=new STARTUPINFO();si.cb=Marshal.SizeOf(si);si.desktop=desktop;PROCESS_INFORMATION pi;
  var childSd=new RawSecurityDescriptor("D:(A;;GA;;;"+WindowsIdentity.GetCurrent().User.Value+")(A;;GA;;;"+DiagnosticSid().Value+")");var childRaw=new byte[childSd.BinaryLength];childSd.GetBinaryForm(childRaw,0);IntPtr childDescriptor=Marshal.AllocHGlobal(childRaw.Length);Marshal.Copy(childRaw,0,childDescriptor,childRaw.Length);var childSa=new SECURITY_ATTRIBUTES();childSa.length=Marshal.SizeOf(childSa);childSa.descriptor=childDescriptor;IntPtr childAttributes=Marshal.AllocHGlobal(childSa.length);Marshal.StructureToPtr(childSa,childAttributes,false);
  string nodeScript="const fs=require('fs'),cp=require('child_process'),p=process.argv[1],s=process.argv[2],d=process.argv[3];let phase=1,aclSpawnError=false,aclExit=-999,canaryStillDenied=false;try{fs.writeFileSync(p+'/node-'+d+'.txt','dummy');if(fs.readFileSync(p+'/node-'+d+'.txt','utf8')!=='dummy')throw 0;phase=2;for(const action of [()=>fs.readFileSync(s+'/canary.txt'),()=>fs.appendFileSync(s+'/canary.txt','dummy')]){let denied=false;try{action()}catch(e){denied=e.code==='EACCES'||e.code==='EPERM'}if(!denied)throw 0}phase=3;const acl=cp.spawnSync(process.env.SystemRoot+'/System32/icacls.exe',[s,'/grant','*S-1-5-32-545:R'],{stdio:'ignore',timeout:3000,env:{SystemRoot:process.env.SystemRoot}});aclSpawnError=Boolean(acl.error);aclExit=Number.isInteger(acl.status)?acl.status:-999;try{fs.readFileSync(s+'/canary.txt')}catch(e){canaryStillDenied=e.code==='EACCES'||e.code==='EPERM'}if(acl.status===0||acl.error||!canaryStillDenied)throw 0;phase=4;if(d==='0'){const child=cp.spawnSync(process.execPath,[...process.execArgv,p,s,'1'],{stdio:'ignore',timeout:5000,env:{SystemRoot:process.env.SystemRoot}});if(child.status!==0||child.error)throw 0}phase=5;fs.writeFileSync(p+'/node-'+d+'-pass.json','true');process.exit(0)}catch{try{fs.writeFileSync(p+'/node-'+d+'-failure.json',JSON.stringify({phase,aclSpawnError,aclExit,canaryStillDenied}))}catch{}process.exit(1)}";
  IntPtr environment=Marshal.StringToHGlobalUni("SystemRoot="+Environment.GetEnvironmentVariable("SystemRoot")+"\0\0");
  try{if(!CreateProcessAsUser(token,exe,new System.Text.StringBuilder(nodeControl?"\""+exe+"\" -e \""+nodeScript+"\" \""+workspace+"\" \""+secret+"\" 0":nativeControl?"\""+exe+"\" /d /c exit 0":"\""+exe+"\" --child \""+workspace+"\" \""+secret+"\" 0"),childAttributes,childAttributes,false,0x08000400,environment,workspace,ref si,out pi))throw new Win32Exception(Marshal.GetLastWin32Error());
   try{if(WaitForSingleObject(pi.process,15000)!=0){TerminateProcess(pi.process,124);throw new TimeoutException();}uint code;if(!GetExitCodeProcess(pi.process,out code))throw new Win32Exception(Marshal.GetLastWin32Error());Console.WriteLine("{\"primaryChildExitCode\":"+code+"}");if(nodeControl){string failure=Path.Combine(workspace,"node-0-failure.json");if(File.Exists(failure)){var diagnostic=File.ReadAllText(failure);if(System.Text.RegularExpressions.Regex.IsMatch(diagnostic,@"^\{""phase"":\d,""aclSpawnError"":(true|false),""aclExit"":-?\d+,""canaryStillDenied"":(true|false)\}$"))Console.WriteLine(diagnostic);}}Require(code==0);if(nodeControl)Require(File.Exists(Path.Combine(workspace,"node-0-pass.json"))&&File.Exists(Path.Combine(workspace,"node-1-pass.json")));else if(!nativeControl)Require(File.Exists(Path.Combine(workspace,"child-0-pass.json"))&&File.Exists(Path.Combine(workspace,"child-1-pass.json")));}finally{CloseHandle(pi.thread);CloseHandle(pi.process);}
  }finally{Marshal.FreeHGlobal(environment);Marshal.FreeHGlobal(childAttributes);Marshal.FreeHGlobal(childDescriptor);}
 }
 static SecurityIdentifier DiagnosticSid() { return new SecurityIdentifier(systemObjectControl?WellKnownSidType.RestrictedCodeSid:WellKnownSidType.BuiltinUsersSid,null); }
 static string B(bool v) { return v?"true":"false"; }
 static bool Step(string name,Action action) {
  var timer=Stopwatch.StartNew();
  try { action(); Console.WriteLine("{\"stage\":\""+name+"\",\"ok\":true,\"elapsedMs\":"+timer.ElapsedMilliseconds+",\"hresult\":0,\"win32Error\":0}");return true; }
  catch(Exception e) { var native=e as Win32Exception; Console.WriteLine("{\"stage\":\""+name+"\",\"ok\":false,\"elapsedMs\":"+timer.ElapsedMilliseconds+",\"hresult\":"+e.HResult+",\"win32Error\":"+(native!=null?native.NativeErrorCode:((e.HResult&unchecked((int)0xffff0000))==unchecked((int)0x80070000)?(e.HResult&65535):0))+",\"errorType\":\""+e.GetType().Name+"\"}");return false; }
 }
 static void Require(bool value) { if(!value)throw new InvalidOperationException(); }
 static DirectorySecurity FreshDacl(DirectorySecurity source) { var fresh=new DirectorySecurity();fresh.SetSecurityDescriptorBinaryForm(source.GetSecurityDescriptorBinaryForm(),AccessControlSections.Access);return fresh; }
 static bool Denied(Action action) { try { action(); return false; } catch(UnauthorizedAccessException) { return true; } }
 public static int Main(string[] args) {
  // Broker has its own finite lifetime if the controller is terminated.
  if(args.Length==4 && args[0]=="--child")return Child(args);
  if(args.Length==1 && args[0]=="--broker") { System.Threading.Thread.Sleep(12000);return 0; }
  systemObjectControl=args.Length==2&&args[1]=="--system-object-control";
  if((args.Length!=1&&!systemObjectControl) || !Path.IsPathRooted(args[0]) || Directory.Exists(args[0])) return 64;
  Console.WriteLine("{\"systemObjectControlDiagnosticOnly\":"+B(systemObjectControl)+"}");
  IntPtr original=IntPtr.Zero,restricted=IntPtr.Zero,sidMemory=IntPtr.Zero,secondSidMemory=IntPtr.Zero;Process broker=null;bool impersonating=false;
  try {
   if(!Step("create-new-root",()=>Directory.CreateDirectory(args[0])))return 125;
   var identity=WindowsIdentity.GetCurrent();var owner=identity.User;
   Step("volume-principal-acl-metadata",()=>{
    var drive=new DriveInfo(Path.GetPathRoot(args[0]));var existing=Directory.GetAccessControl(args[0],AccessControlSections.Access|AccessControlSections.Owner);
    Console.WriteLine("{\"metadata\":true,\"ntfs\":"+B(drive.DriveFormat=="NTFS")+",\"fixedVolume\":"+B(drive.DriveType==DriveType.Fixed)+",\"ownerMatchesPrincipal\":"+B(existing.GetOwner(typeof(SecurityIdentifier)).Equals(owner))+",\"groupCount\":"+identity.Groups.Count+",\"administratorEnabled\":"+B(new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))+",\"daclProtected\":"+B(existing.AreAccessRulesProtected)+",\"aceCount\":"+existing.GetAccessRules(true,true,typeof(SecurityIdentifier)).Count+"}");
   });
   if(!Step("open-own-token",()=>{if(!OpenProcessToken(GetCurrentProcess(),0x8B,out original))throw new Win32Exception(Marshal.GetLastWin32Error());}))return 125;
   Step("integrity-metadata",()=>{int size;GetTokenInformation(original,25,IntPtr.Zero,0,out size);IntPtr info=Marshal.AllocHGlobal(size);try{if(!GetTokenInformation(original,25,info,size,out size))throw new Win32Exception(Marshal.GetLastWin32Error());var sid=new SecurityIdentifier(Marshal.ReadIntPtr(info));var parts=sid.Value.Split('-');Console.WriteLine("{\"integrityRid\":"+int.Parse(parts[parts.Length-1])+"}");}finally{Marshal.FreeHGlobal(info);}});
   string workspace=Path.Combine(args[0],"dummy-workspace"),secret=Path.Combine(args[0],"fake-secret-only"),ownerTest=Path.Combine(args[0],"owner-only");
   Directory.CreateDirectory(workspace);Directory.CreateDirectory(secret);Directory.CreateDirectory(ownerTest);
   bool ordinary=Step("ordinary-dummy-read-write",()=>{string f=Path.Combine(workspace,"dummy.txt");File.WriteAllText(f,"dummy");File.AppendAllText(f,"-ok");Require(File.ReadAllText(f)=="dummy-ok");});
   // Never include owner in the DACL write. Owner probe separately reapplies the existing owner.
   var acl=new DirectorySecurity();acl.SetAccessRuleProtection(true,false);acl.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
   bool dacl=Step("dacl-only-protection",()=>Directory.SetAccessControl(secret,acl));
   Step("owner-only-same-owner",()=>{var current=Directory.GetAccessControl(ownerTest,AccessControlSections.Owner);var ownerAcl=new DirectorySecurity();ownerAcl.SetOwner(current.GetOwner(typeof(SecurityIdentifier)));Directory.SetAccessControl(ownerTest,ownerAcl);});
   var users=DiagnosticSid();
   bool workspaceAcl=Step("dummy-workspace-dacl",()=>{var wa=new DirectorySecurity();wa.SetAccessRuleProtection(true,false);wa.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));wa.AddAccessRule(new FileSystemAccessRule(users,FileSystemRights.Modify,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(workspace,wa);});
   if(!ordinary||!dacl||!workspaceAcl){Console.WriteLine("{\"scope\":\"ENVIRONMENT_DIAGNOSIS_ONLY\",\"fullIsolationCertified\":false}");return 125;}
   string canary=Path.Combine(secret,"canary.txt");File.WriteAllText(canary,Guid.NewGuid().ToString("N"));
   string hardened=Path.Combine(args[0],"owner-rights-canary");Directory.CreateDirectory(hardened);var hardenedAcl=new DirectorySecurity();hardenedAcl.SetAccessRuleProtection(true,false);hardenedAcl.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));hardenedAcl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-3-4"),FileSystemRights.ReadPermissions,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(hardened,hardenedAcl);string hardenedFile=Path.Combine(hardened,"canary.txt");File.WriteAllText(hardenedFile,Guid.NewGuid().ToString("N"));
   var bytes=new byte[users.BinaryLength];users.GetBinaryForm(bytes,0);sidMemory=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,sidMemory,bytes.Length);var restrict=new SID_PAIR();restrict.First.Sid=sidMemory;
   if(systemObjectControl){var second=new SecurityIdentifier(WellKnownSidType.BuiltinUsersSid,null);var secondBytes=new byte[second.BinaryLength];second.GetBinaryForm(secondBytes,0);secondSidMemory=Marshal.AllocHGlobal(secondBytes.Length);Marshal.Copy(secondBytes,0,secondSidMemory,secondBytes.Length);restrict.Second.Sid=secondSidMemory;}
   if(!Step("create-restricted-token",()=>{if(!CreateRestrictedToken(original,1,0,IntPtr.Zero,0,IntPtr.Zero,systemObjectControl?2u:1u,ref restrict,out restricted))throw new Win32Exception(Marshal.GetLastWin32Error());}))return 125;
   broker=Process.Start(new ProcessStartInfo(Process.GetCurrentProcess().MainModule.FileName,"--broker"){UseShellExecute=false,CreateNoWindow=true});
   string diagnosticExe=Process.GetCurrentProcess().MainModule.FileName;
   string diagnosticSystem=Environment.GetFolderPath(Environment.SpecialFolder.System);
   if(!Step("impersonate",()=>{if(!ImpersonateLoggedOnUser(restricted))throw new Win32Exception(Marshal.GetLastWin32Error());impersonating=true;}))return 125;
   Step("restricted-own-executable-read",()=>{using(var f=File.OpenRead(diagnosticExe)){Require(f.ReadByte()>=0);}});
   Step("restricted-system-loader-read",()=>{using(var f=File.OpenRead(Path.Combine(diagnosticSystem,"ntdll.dll"))){Require(f.ReadByte()>=0);}});
   Step("restricted-clr-read",()=>{using(var f=File.OpenRead(Path.Combine(RuntimeEnvironment.GetRuntimeDirectory(),"clr.dll"))){Require(f.ReadByte()>=0);}});
   bool positive=Step("restricted-dummy-read-write",()=>{string f=Path.Combine(workspace,"restricted.txt");File.WriteAllText(f,"dummy");Require(File.ReadAllText(f)=="dummy");});
   bool readDenied=Step("restricted-canary-read-denial",()=>Require(Denied(()=>File.ReadAllText(canary))));
   bool writeDenied=Step("restricted-canary-write-denial",()=>Require(Denied(()=>File.AppendAllText(canary,"dummy"))));
   bool aclDenied=Step("restricted-canary-acl-denial",()=>Require(Denied(()=>Directory.SetAccessControl(secret,FreshDacl(acl)))));
   bool vulnerableBypass=Step("original-acl-fresh-grant-denial",()=>Require(Denied(()=>{var attack=new DirectorySecurity();attack.SetAccessRuleProtection(true,false);attack.AddAccessRule(new FileSystemAccessRule(owner,FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));attack.AddAccessRule(new FileSystemAccessRule(users,FileSystemRights.ReadAndExecute,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));Directory.SetAccessControl(secret,attack); })));
   bool rereadDenied=Step("original-acl-read-after-grant-attempt-denial",()=>Require(Denied(()=>File.ReadAllText(canary))));
   bool hardenedRead=Step("owner-rights-read-denial",()=>Require(Denied(()=>File.ReadAllText(hardenedFile))));
   bool hardenedWrite=Step("owner-rights-write-denial",()=>Require(Denied(()=>File.AppendAllText(hardenedFile,"dummy"))));
   bool hardenedModify=Step("owner-rights-acl-grant-denial",()=>Require(Denied(()=>Directory.SetAccessControl(hardened,FreshDacl(acl)))));
   bool negative=readDenied&&writeDenied&&aclDenied&&vulnerableBypass&&rereadDenied&&hardenedRead&&hardenedWrite&&hardenedModify;
   bool memory=Step("restricted-broker-memory-denial",()=>{IntPtr handle=OpenProcess(0x10,false,broker.Id);int error=Marshal.GetLastWin32Error();if(handle!=IntPtr.Zero)CloseHandle(handle);Require(handle==IntPtr.Zero&&error==5);});
   bool flag=IsTokenRestricted(restricted);if(!RevertToSelf())Environment.FailFast("REVERT_FAILED");impersonating=false;
   // Diagnostic-only default DACL on this new restricted token; never alter broker or user objects.
   Step("restricted-token-default-object-dacl",()=>{
    var sd=new RawSecurityDescriptor("D:(A;;GA;;;"+owner.Value+")(A;;GA;;;"+DiagnosticSid().Value+")");
    var raw=new byte[sd.DiscretionaryAcl.BinaryLength];sd.DiscretionaryAcl.GetBinaryForm(raw,0);
    IntPtr aclPtr=Marshal.AllocHGlobal(raw.Length),info=Marshal.AllocHGlobal(IntPtr.Size);
    try{Marshal.Copy(raw,0,aclPtr,raw.Length);Marshal.WriteIntPtr(info,aclPtr);if(!SetTokenInformation(restricted,6,info,IntPtr.Size))throw new Win32Exception(Marshal.GetLastWin32Error());}
    finally{Marshal.FreeHGlobal(info);Marshal.FreeHGlobal(aclPtr);}
   });
   bool nativeControl=Step("restricted-native-cmd-startup-control",()=>Primary(restricted,workspace,hardened,null,true));
   bool nodeControl=!systemObjectControl||Step("restricted-node-child-grandchild-controls",()=>Primary(restricted,workspace,hardened,null,false,true));
   bool primary=Step("restricted-primary-child-grandchild-controls",()=>Primary(restricted,workspace,hardened));
   Console.WriteLine("{\"restrictedToken\":"+B(flag)+",\"scope\":\"THREAD_ACCESS_CHECK_ONLY\",\"fullIsolationCertified\":false}");return positive&&negative&&memory&&flag&&primary&&nativeControl&&nodeControl?0:1;
  }catch(Exception e){Console.WriteLine("{\"stage\":\"unexpected\",\"ok\":false,\"hresult\":"+e.HResult+",\"errorType\":\""+e.GetType().Name+"\"}");return 125;}
  finally {if(impersonating&&!RevertToSelf())Environment.FailFast("REVERT_FAILED");if(broker!=null){try{if(!broker.HasExited)broker.Kill();broker.WaitForExit(2000);}finally{broker.Dispose();}}if(restricted!=IntPtr.Zero)CloseHandle(restricted);if(original!=IntPtr.Zero)CloseHandle(original);if(sidMemory!=IntPtr.Zero)Marshal.FreeHGlobal(sidMemory);if(secondSidMemory!=IntPtr.Zero)Marshal.FreeHGlobal(secondSidMemory);}
 }
}












