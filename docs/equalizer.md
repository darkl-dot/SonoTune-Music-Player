# Equalizer

Open **Equalizer** below Genres in the sidebar. It has ten peaking bands (31 Hz to
16 kHz), adjustable from -12 to +12 dB in 0.5 dB steps. Double-click a band to reset
it. The preset picker offers Flat, Bass, Vocal, Rock, Electronic, and Custom.

The preamp ranges from -24 to 0 dB. Boosting bands can overload the output; lower
the preamp when boosting. Factory presets include a conservative preamp setting.
There is no automatic limiter. Reset sets every band and the preamp to zero;
the switch bypasses processing while retaining your adjustments.

Settings persist in the interface's local storage and apply to the playing track
without restarting it.
The EQ runs after the fixed-format stereo gapless queue, so preloaded tracks and
recovered audio outputs receive the same settings. Parameters move gradually;
the callback checks for updates once per block with a nonblocking lock.
The browser preview uses Web Audio peaking filters with the same frequencies and Q.

Native filters use the [RBJ biquad equations](https://www.w3.org/TR/audio-eq-cookbook/)
with Q = 1.4. DSP tests verify center-frequency gain/cut, bypass, off-band response,
live parameter updates, and channel independence. Existing playback tests cover
seeking, output recovery, and exact gapless concatenation with a flat EQ.
