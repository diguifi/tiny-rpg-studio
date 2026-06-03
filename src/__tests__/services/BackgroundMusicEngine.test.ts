import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundMusicEngine } from '../../runtime/services/BackgroundMusicEngine';

describe('BackgroundMusicEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates a hidden looping YouTube iframe when playback starts', () => {
    const engine = new BackgroundMusicEngine();

    engine.setVideoId('t0ihNLLZNi0');
    engine.play();

    const iframe = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]');
    expect(iframe).toBeInstanceOf(HTMLIFrameElement);
    expect(iframe?.getAttribute('src')).toContain('playlist=t0ihNLLZNi0');
    expect(iframe?.getAttribute('src')).toContain('loop=1');
    expect(iframe?.getAttribute('src')).toContain('enablejsapi=1');
  });

  it('removes playback when the configured video id is cleared', () => {
    const engine = new BackgroundMusicEngine();

    engine.setVideoId('t0ihNLLZNi0');
    engine.play();
    expect(document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]')).toBeInstanceOf(HTMLIFrameElement);
    engine.setVideoId('');

    expect(document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]')).toBeNull();
  });

  it('syncs from game data and destroys the iframe on teardown', () => {
    const engine = new BackgroundMusicEngine();

    engine.syncFromGame({ backgroundMusicVideoId: 't0ihNLLZNi0' });
    engine.play();
    expect(document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]')).toBeInstanceOf(HTMLIFrameElement);
    engine.destroy();

    expect(document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]')).toBeNull();
  });

  it('syncs and applies volume from game data', () => {
    const engine = new BackgroundMusicEngine();

    engine.syncFromGame({ backgroundMusicVideoId: 't0ihNLLZNi0', backgroundMusicVolume: 37 });
    engine.play();

    const iframe = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]') as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });
    iframe.dispatchEvent(new Event('load'));

    expect(engine.getVolume()).toBe(37);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [37] }),
      'https://www.youtube.com',
    );
  });

  it('setVolume posts a YouTube setVolume command to an existing iframe', () => {
    const engine = new BackgroundMusicEngine();

    engine.setVideoId('t0ihNLLZNi0');
    engine.play();
    const iframe = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]') as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });

    engine.setVolume(42.8);

    expect(engine.getVolume()).toBe(42);
    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [42] }),
      'https://www.youtube.com',
    );
  });

  it('applies volume set before play when the iframe loads', () => {
    const engine = new BackgroundMusicEngine();

    engine.setVideoId('t0ihNLLZNi0');
    engine.setVolume(25);
    engine.play();

    const iframe = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]') as HTMLIFrameElement;
    const postMessage = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    });
    iframe.dispatchEvent(new Event('load'));

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [25] }),
      'https://www.youtube.com',
    );
  });

  it('keeps local volume usable after the video id is cleared', () => {
    const engine = new BackgroundMusicEngine();

    engine.syncFromGame({ backgroundMusicVideoId: 't0ihNLLZNi0', backgroundMusicVolume: 65 });
    engine.play();
    engine.syncFromGame({ backgroundMusicVideoId: '', backgroundMusicVolume: 65 });
    engine.setVolume(12);

    expect(document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]')).toBeNull();
    expect(engine.getVolume()).toBe(12);
  });

  it('does not restart playback when play is called again with the same video id', () => {
    const engine = new BackgroundMusicEngine();

    engine.setVideoId('t0ihNLLZNi0');
    engine.play();

    const iframe = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]') as HTMLIFrameElement | null;
    const firstSrc = iframe?.getAttribute('src');

    engine.play();

    const iframeAfterSecondPlay = document.querySelector('iframe[src*="youtube.com/embed/t0ihNLLZNi0"]') as HTMLIFrameElement | null;
    expect(iframeAfterSecondPlay).toBe(iframe);
    expect(iframeAfterSecondPlay?.getAttribute('src')).toBe(firstSrc);
  });
});
