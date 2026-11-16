// The few UnityEngine members the engine-free Core code touches, so it compiles as a plain .NET app.
namespace UnityEngine
{
    public static class Debug
    {
        public static void Log(object msg) => System.Console.Error.WriteLine(msg);
        public static void LogWarning(object msg) => System.Console.Error.WriteLine("warning: " + msg);
        public static void LogError(object msg) => System.Console.Error.WriteLine("error: " + msg);
    }
}
