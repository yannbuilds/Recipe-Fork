/*
 * The page the video WebView runs.
 *
 * The IFrame API is the only way to ask a YouTube embed where it got to, so the
 * WebView hosts a real player and posts its clock back to the app once a second
 * — that stream of positions is what makes the video resume where you left it.
 *
 * Messages out, all JSON:
 *   { type: 'ready', seconds, duration }  the player is up and playing
 *   { type: 'time',  seconds, duration }  a tick, or a play/pause
 *   { type: 'ended' }                     watched to the end
 *   { type: 'error' }                     no API, or the video won't embed
 *
 * In: `window.__rfSeek(seconds)`, for "Start over".
 *
 * Kept out of the component so it can be read — and tested — as what it is: a
 * page, not a string.
 */

/** No player after this long and we stop pretending it's coming. */
const READY_TIMEOUT_MS = 10000;

export function youTubePlayerHtml(videoId: string, startAt: number): string {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #000; overflow: hidden; }
      #player { width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      var START = ${Math.floor(startAt)};
      var player = null;
      var poll = null;
      var ready = false;
      function post(msg) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
      function clock(type) {
        try {
          post({ type: type, seconds: player.getCurrentTime(), duration: player.getDuration() });
        } catch (e) {}
      }
      // Called from the app when you tap "Start over".
      window.__rfSeek = function (seconds) {
        try { player.seekTo(seconds, true); player.playVideo(); } catch (e) {}
      };
      window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('player', {
          width: '100%',
          height: '100%',
          videoId: '${videoId}',
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, start: START },
          events: {
            onReady: function (e) {
              ready = true;
              // \`start\` gets you close; the seek is what lands on the second
              // you left off, and it survives the player re-cueing.
              if (START > 0) { try { e.target.seekTo(START, true); } catch (err) {} }
              try { e.target.playVideo(); } catch (err) {}
              clock('ready');
              poll = setInterval(function () { clock('time'); }, 1000);
            },
            onStateChange: function (e) {
              if (e.data === YT.PlayerState.ENDED) post({ type: 'ended' });
              else clock('time');
            },
            // Fires for videos whose channel has blocked embedding — common
            // enough on recipe channels that it needs a way out, not a spinner.
            onError: function () { post({ type: 'error' }); }
          }
        });
      };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.onerror = function () { post({ type: 'error' }); };
      document.head.appendChild(tag);
      // Kitchen wifi can leave the request hanging rather than failing.
      setTimeout(function () { if (!ready) post({ type: 'error' }); }, ${READY_TIMEOUT_MS});
    </script>
  </body>
</html>`;
}
