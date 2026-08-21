import { Ionicons } from '@expo/vector-icons';
import { formatVideoTime } from '@recipe-aggregator/shared/videoProgress';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import PressableScale from '@/components/PressableScale';
import { Body, Mono } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';
import { NO_MARK, forgetVideoMark, loadVideoMark, saveVideoMark, type VideoMarkView } from '@/lib/videoProgress';
import { youTubePlayerHtml } from '@/lib/youtubePlayerHtml';

/*
 * The recipe video, played in the app rather than handed to YouTube.
 *
 * Handing it over was fine for watching a video; it's wrong for cooking from
 * one. Half of following a recipe by video is closing it to chop something and
 * opening it again thirty seconds later, and every one of those round trips
 * used to leave the kitchen — app out, YouTube in, app back. Playing it here
 * keeps the recipe one tap away, and the position is remembered on this side,
 * so it picks up where you left off whether you closed the player, walked over
 * to the meal plan, or came back tomorrow.
 *
 * "Open in YouTube" is still there for when you want the big screen — and it
 * carries the position across with it.
 */

interface Props {
  videoId: string;
  /** The original URL, for handing off to YouTube proper. */
  url: string;
  title: string;
}

/** Commit to storage every few player ticks — cheap insurance against a kill. */
const PERSIST_EVERY = 5;

/** How long the "picking up at…" line stays before it gets out of the way. */
const RESUME_NOTE_MS = 5000;

export default function VideoPlayer({ videoId, url, title }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [open, setOpen] = useState(false);
  const [mark, setMark] = useState<VideoMarkView>(NO_MARK);
  const [html, setHtml] = useState<string | null>(null);
  const [resumedFrom, setResumedFrom] = useState(0);
  const [noteVisible, setNoteVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const webRef = useRef<WebView>(null);
  const positionRef = useRef(0);
  const durationRef = useRef<number | null>(null);
  const ticksRef = useRef(0);

  /* The mark is read up front so the thumbnail can advertise it and the player
     knows where to start the moment it's tapped — AsyncStorage is async, and
     waiting for it after the tap would cost the player a beat. */
  const refreshMark = useCallback(() => {
    let alive = true;
    loadVideoMark(videoId).then((next) => {
      if (alive) setMark(next);
    });
    return () => {
      alive = false;
    };
  }, [videoId]);

  useEffect(() => refreshMark(), [refreshMark]);

  const persist = useCallback(
    () => saveVideoMark(videoId, positionRef.current, durationRef.current),
    [videoId],
  );

  /* Watching is the one time the phone is being *looked* at without being
     touched, so hold the screen for as long as the player is up. */
  useEffect(() => {
    if (!open) return;
    const tag = `video-${videoId}`;
    activateKeepAwakeAsync(tag).catch(() => {});
    return () => {
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [open, videoId]);

  /* Backgrounding the app can end it without any cleanup running, so commit
     the position on the way out. */
  useEffect(() => {
    if (!open) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') persist();
    });
    return () => sub.remove();
  }, [open, persist]);

  useEffect(() => {
    if (!open || !noteVisible) return;
    const timer = setTimeout(() => setNoteVisible(false), RESUME_NOTE_MS);
    return () => clearTimeout(timer);
  }, [open, noteVisible]);

  function openPlayer() {
    haptics.medium();
    const at = mark.seconds;
    positionRef.current = at;
    durationRef.current = null;
    ticksRef.current = 0;
    setResumedFrom(at);
    setNoteVisible(at > 0);
    setLoading(true);
    setFailed(false);
    setHtml(youTubePlayerHtml(videoId, at));
    setOpen(true);
  }

  function closePlayer() {
    // The write has to land before the thumbnail re-reads it, or the pill comes
    // back showing the position from the *previous* watch.
    persist().finally(refreshMark);
    setOpen(false);
    setHtml(null);
  }

  function startOver() {
    positionRef.current = 0;
    forgetVideoMark(videoId);
    setResumedFrom(0);
    setNoteVisible(false);
    webRef.current?.injectJavaScript('window.__rfSeek(0); true;');
    haptics.select();
  }

  /* Hand off to YouTube at the same second we're on, so the big screen picks up
     the thread rather than starting the recipe again. */
  function openInYouTube() {
    const seconds = Math.floor(positionRef.current);
    const handoff = seconds > 0 ? `https://youtu.be/${videoId}?t=${seconds}` : url;
    // Two players running at once helps nobody — hand over and step back.
    closePlayer();
    Linking.openURL(handoff).catch(() => Linking.openURL(url).catch(() => {}));
  }

  function onMessage(e: WebViewMessageEvent) {
    let msg: { type?: string; seconds?: number; duration?: number };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'error') {
      setFailed(true);
      setLoading(false);
      return;
    }
    if (typeof msg.duration === 'number' && msg.duration > 0) durationRef.current = msg.duration;
    if (msg.type === 'ended') {
      // Watched to the end: next open starts from the top.
      positionRef.current = 0;
      forgetVideoMark(videoId);
      return;
    }
    if (typeof msg.seconds === 'number' && Number.isFinite(msg.seconds) && msg.seconds > 0) {
      positionRef.current = msg.seconds;
    }
    if (msg.type === 'ready') {
      setLoading(false);
      return;
    }
    ticksRef.current += 1;
    if (ticksRef.current % PERSIST_EVERY === 0) persist();
  }

  const hasMark = mark.seconds > 0;

  return (
    <>
      <PressableScale onPress={openPlayer} scaleTo={0.985}>
        <View
          style={{
            borderRadius: 8,
            overflow: 'hidden',
            aspectRatio: 16 / 9,
            backgroundColor: t.paper3,
          }}
        >
          <Image
            source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={videoId}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(0,0,0,0.55)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="play" size={26} color="#fff" />
            </View>
          </View>

          {/* Where you left it — the pill says it, the bar shows it. */}
          {hasMark && (
            <View
              style={{
                position: 'absolute',
                left: 10,
                bottom: 12,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: 'rgba(251,248,241,0.94)',
              }}
            >
              <Mono size={10} color="#3d6b4e">
                RESUME {formatVideoTime(mark.seconds)}
              </Mono>
            </View>
          )}
          {mark.fraction !== null && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: 3,
                backgroundColor: 'rgba(31,27,22,0.35)',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.round(mark.fraction * 100)}%`,
                  backgroundColor: '#3d6b4e',
                }}
              />
            </View>
          )}
        </View>
      </PressableScale>

      <Modal
        visible={open}
        animationType="fade"
        onRequestClose={closePlayer}
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {/* Top bar: out, and over to YouTube */}
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 14,
              paddingBottom: 8,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Pressable onPress={closePlayer} hitSlop={12} accessibilityLabel="Close video">
              <Ionicons name="close" size={28} color="rgba(255,255,255,0.85)" />
            </Pressable>
            <Pressable onPress={openInYouTube} hitSlop={12}>
              <Body size={13} color="rgba(255,255,255,0.75)">
                Open in YouTube
              </Body>
            </Pressable>
          </View>

          <View style={{ flex: 1, justifyContent: 'center' }}>
            {/* Say out loud that it picked up where you left off — otherwise a
                video starting three minutes in just looks broken. */}
            {resumedFrom > 0 && noteVisible && !failed && (
              <View
                style={{
                  alignSelf: 'center',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: 'rgba(251,248,241,0.94)',
                }}
              >
                <Body size={13} color="#1f1b16">
                  Picking up at {formatVideoTime(resumedFrom)}
                </Body>
                <Pressable onPress={startOver} hitSlop={8}>
                  <Body size={13} weight="semi" color="#3d6b4e">
                    Start over
                  </Body>
                </Pressable>
              </View>
            )}

            {failed ? (
              <View style={{ paddingHorizontal: 32, alignItems: 'center', gap: 16 }}>
                <Body size={14} color="rgba(255,255,255,0.8)" style={{ textAlign: 'center' }}>
                  {title} wouldn't play here — no connection, or the video won't allow embedding.
                </Body>
                <Pressable onPress={openInYouTube} hitSlop={10}>
                  <Body size={14} weight="semi" color="#fff">
                    Open in YouTube
                  </Body>
                </Pressable>
              </View>
            ) : (
              <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
                {html && (
                  <WebView
                    ref={webRef}
                    source={{ html, baseUrl: 'https://www.youtube.com' }}
                    originWhitelist={['*']}
                    onMessage={onMessage}
                    onError={() => setFailed(true)}
                    onShouldStartLoadWithRequest={(req) => {
                      // The embed carries a YouTube wordmark that navigates to
                      // the full site. Left alone this WebView would quietly
                      // become a browser, so send those taps to the app — with
                      // the position, like the button does. Everything else
                      // (our page, the embed iframe) loads as normal.
                      if (req.isTopFrame === false) return true;
                      if (/^https?:\/\/((www|m)\.youtube\.com\/watch|youtu\.be\/)/.test(req.url)) {
                        openInYouTube();
                        return false;
                      }
                      return true;
                    }}
                    style={{ flex: 1, backgroundColor: '#000' }}
                    javaScriptEnabled
                    domStorageEnabled
                    allowsInlineMediaPlayback
                    allowsFullscreenVideo
                    mediaPlaybackRequiresUserAction={false}
                    scrollEnabled={false}
                    bounces={false}
                    setSupportMultipleWindows={false}
                  />
                )}
                {loading && (
                  <View
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    pointerEvents="none"
                  >
                    <ActivityIndicator color="#fbf8f1" />
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
