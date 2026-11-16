// Receives the Playgama Bridge events that CozyBridge.jslib sends with SendMessage("CozyBlocks", ...) and hands
// them to PlatformSdk. Lives on the same GameObject as GameHost.
using UnityEngine;

namespace CozyBlocks.Platform
{
    public sealed class PlatformBridgeReceiver : MonoBehaviour
    {
        public void OnBridgeAudio(string v) => PlatformSdk.OnAudio(v == "1");
        public void OnBridgePause(string v) => PlatformSdk.OnPause(v == "1");
        public void OnBridgeInterstitial(string state) => PlatformSdk.OnInterstitial(state);
        public void OnBridgeRewarded(string state) => PlatformSdk.OnRewarded(state);
        public void OnBridgeStorage(string payload) => PlatformSdk.OnStorage(payload);
        /// <summary>From the WebGL page's visibilitychange: "0" hidden, "1" visible.</summary>
        public void OnPageVisibility(string v) => PlatformSdk.SetPaused(v == "0");
    }
}
