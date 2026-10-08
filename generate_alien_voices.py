import wave
import numpy as np
import os
import subprocess
import math

def generate_base_tts(filename, voice_name="Microsoft David Desktop", text="Puny humans, your planet is ours!", rate=-2):
    ps_lines = [
        "Add-Type -AssemblyName System.Speech",
        "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer"
    ]
    if voice_name:
        ps_lines.append(f'$synth.SelectVoice("{voice_name}")')
    ps_lines.extend([
        f"$synth.Rate = {rate}",
        "$synth.Volume = 100",
        f'$synth.SetOutputToWaveFile("{filename}")',
        f'$synth.Speak("{text}")',
        "$synth.Dispose()"
    ])
    
    with open("temp_gen_tts.ps1", "w", encoding="utf-8") as f:
        f.write("\n".join(ps_lines))
        
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "temp_gen_tts.ps1"], 
                   capture_output=True, text=True)
    if os.path.exists("temp_gen_tts.ps1"):
        os.remove("temp_gen_tts.ps1")

def read_wav(filename):
    with wave.open(filename, 'rb') as w:
        n_channels = w.getnchannels()
        sampwidth = w.getsampwidth()
        framerate = w.getframerate()
        n_frames = w.getnframes()
        data = w.readframes(n_frames)
    samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)
    return samples, framerate

def write_wav(filename, samples, framerate):
    # Normalize peak
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = (samples / peak) * 0.95
    int_samples = np.clip(samples * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(filename, 'wb') as w:
        if len(samples.shape) == 1:
            w.setnchannels(1)
        else:
            w.setnchannels(samples.shape[1])
        w.setsampwidth(2)
        w.setframerate(framerate)
        w.writeframes(int_samples.tobytes())

def resample(samples, factor):
    new_len = int(len(samples) / factor)
    indices = np.linspace(0, len(samples) - 1, new_len)
    return np.interp(indices, np.arange(len(samples)), samples)

def trim_silence(samples, sr, threshold=0.015):
    non_silent = np.where(np.abs(samples) > threshold)[0]
    if len(non_silent) > 0:
        start_idx = max(0, non_silent[0] - int(sr * 0.05))
        end_idx = min(len(samples), non_silent[-1] + int(sr * 0.08))
        return samples[start_idx:end_idx]
    return samples

def apply_ring_mod(samples, sr, mod_freq=45.0, depth=0.75):
    t = np.arange(len(samples)) / sr
    carrier = np.sin(2 * np.pi * mod_freq * t)
    mod = (1.0 - depth) + depth * carrier
    return samples * mod

def apply_comb_filter(samples, sr, delay_ms=4.8, feedback=0.45):
    delay_samples = int(sr * (delay_ms / 1000.0))
    out = np.zeros(len(samples) + delay_samples)
    out[:len(samples)] = samples.copy()
    for i in range(delay_samples, len(samples)):
        out[i] += out[i - delay_samples] * feedback
    return out[:len(samples)]

def apply_reverb(samples, sr, taps=[(0.04, 0.35), (0.085, 0.22), (0.15, 0.14)]):
    extra = int(sr * 0.4)
    out = np.zeros(len(samples) + extra)
    out[:len(samples)] = samples
    for delay_sec, gain in taps:
        offset = int(sr * delay_sec)
        if offset < len(out):
            out[offset:offset + len(samples)] += samples * gain
    return out

def bitcrush(samples, bits=8):
    steps = 2 ** bits
    return np.round(samples * (steps / 2)) / (steps / 2)

def bandpass_filter(samples, sr, low=350, high=3000):
    # FFT bandpass filter
    fft = np.fft.rfft(samples)
    freqs = np.fft.rfftfreq(len(samples), d=1.0/sr)
    # create smooth roll-off mask
    mask = np.ones_like(freqs)
    mask[freqs < low] *= np.clip((freqs[freqs < low] / low) ** 2, 0, 1)
    mask[freqs > high] *= np.clip((high / freqs[freqs > high]) ** 2, 0, 1)
    return np.fft.irfft(fft * mask, n=len(samples))

def build_alien_transmission(raw_file, output_file, mode="overlord", sr=22050):
    raw, in_sr = read_wav(raw_file)
    raw = trim_silence(raw, in_sr)
    
    if mode == "overlord":
        # Pitch down ~4 semitones for ominous giant alien commander
        pitch_shifted = resample(raw, factor=0.82)
        # Deep sub-growl layer (down an octave)
        sub_growl = resample(raw, factor=0.68)
        # Dalek/Cyberman ring mod
        ring = apply_ring_mod(pitch_shifted, sr, mod_freq=42.0, depth=0.8)
        comb = apply_comb_filter(ring, sr, delay_ms=5.0, feedback=0.45)
        # Mix
        min_len = min(len(comb), len(sub_growl))
        voice = (comb[:min_len] * 0.7) + (sub_growl[:min_len] * 0.3)
        voice = apply_reverb(voice, sr, taps=[(0.045, 0.35), (0.09, 0.22), (0.16, 0.15)])
        
    elif mode == "arcade8bit":
        # 1980s Arcade TMS speech chip style (Sinistar / Berzerk)
        pitch_shifted = resample(raw, factor=0.85)
        ring = apply_ring_mod(pitch_shifted, sr, mod_freq=55.0, depth=0.9)
        comb = apply_comb_filter(ring, sr, delay_ms=3.8, feedback=0.5)
        # Bandpass filter for arcade horn speaker
        filtered = bandpass_filter(comb, sr, low=400, high=2600)
        # 8-bit arcade quantization
        voice = bitcrush(filtered, bits=7)
        voice = apply_reverb(voice, sr, taps=[(0.035, 0.28), (0.07, 0.15)])
        
    elif mode == "cybernetic":
        # Dual alien hive mind / extraterrestrial invader
        pitch_shifted = resample(raw, factor=0.88)
        ring1 = apply_ring_mod(pitch_shifted, sr, mod_freq=62.0, depth=0.75)
        ring2 = apply_ring_mod(pitch_shifted, sr, mod_freq=31.0, depth=0.75)
        comb = apply_comb_filter((ring1 + ring2) * 0.5, sr, delay_ms=6.2, feedback=0.48)
        voice = apply_reverb(comb, sr, taps=[(0.05, 0.4), (0.11, 0.25), (0.18, 0.15)])

    # Add SFX framing: Opening alien telemetry chirp & deep sub-bass mothership drone
    intro_sec = 0.28
    intro_len = int(sr * intro_sec)
    t_intro = np.arange(intro_len) / sr
    chirp = np.sin(2 * np.pi * (2100 - 1500 * (t_intro / intro_sec)) * t_intro) * 0.2
    chirp *= np.exp(-t_intro * 12)
    
    total_len = len(voice) + intro_len + int(sr * 0.35)
    final_mono = np.zeros(total_len)
    final_mono[:intro_len] += chirp
    
    voice_start = int(sr * 0.20)
    final_mono[voice_start:voice_start + len(voice)] += voice * 0.88
    
    # Low alien drone
    t_all = np.arange(total_len) / sr
    drone = np.sin(2 * np.pi * 55 * t_all) * (0.08 + 0.04 * np.sin(2 * np.pi * 7 * t_all))
    fade = int(sr * 0.25)
    drone[:fade] *= np.linspace(0, 1, fade)
    drone[-fade:] *= np.linspace(1, 0, fade)
    final_mono += drone * 0.4
    
    # Stereo widening (14ms stereo slapback spread)
    stereo_delay = int(sr * 0.014)
    left = final_mono.copy()
    right = np.zeros_like(final_mono)
    right[stereo_delay:] = final_mono[:-stereo_delay] * 0.95
    stereo = np.column_stack([left, right])
    
    write_wav(output_file, stereo, sr)
    print(f"[{mode}] Generated {output_file} (duration: {total_len/sr:.2f}s, size: {os.path.getsize(output_file)} bytes)")

# 1. Generate clean base speech
generate_base_tts("raw_speech.wav", voice_name="Microsoft David Desktop", text="Puny humans... your planet is ours!", rate=-1)

# Ensure public/audio directory exists
os.makedirs("public/audio", exist_ok=True)

# 2. Build 3 distinct alien sound variations
build_alien_transmission("raw_speech.wav", "public/audio/alien_overlord.wav", mode="overlord")
build_alien_transmission("raw_speech.wav", "public/audio/alien_arcade8bit.wav", mode="arcade8bit")
build_alien_transmission("raw_speech.wav", "public/audio/alien_cybernetic.wav", mode="cybernetic")

# Also set the default one to alien_wave_start.wav
import shutil
shutil.copyfile("public/audio/alien_overlord.wav", "public/audio/alien_wave_start.wav")
print("Saved default public/audio/alien_wave_start.wav")
