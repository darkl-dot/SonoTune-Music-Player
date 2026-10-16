//! One-way snapshots out, nonblocking commands in. The audio controller owns all state.
use crate::model::{Playback, Repeat};

#[derive(Clone, Debug, PartialEq)]
pub enum MediaAction {
    Play,
    Pause,
    Stop,
    Next,
    Previous,
    Seek(f64),
    Shuffle(bool),
    Repeat(SystemRepeat),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum SystemRepeat {
    None,
    Track,
    List,
}

pub fn external_repeat(current: &Repeat, requested: SystemRepeat) -> Repeat {
    match requested {
        SystemRepeat::Track => Repeat::One,
        SystemRepeat::List => Repeat::All,
        SystemRepeat::None if *current == Repeat::Single => Repeat::Single,
        SystemRepeat::None => Repeat::None,
    }
}

/// WinRT TimeSpan uses signed 100ns ticks. Keep invalid input out of the ABI.
pub fn ticks(seconds: f64) -> i64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds.min(i64::MAX as f64 / 10_000_000.0) * 10_000_000.0) as i64
}

pub fn position(state: &Playback) -> f64 {
    if !state.position.is_finite() || !state.duration.is_finite() {
        return 0.0;
    }
    state.position.clamp(0.0, state.duration.max(0.0))
}

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::SystemMedia;

#[cfg(not(windows))]
pub struct SystemMedia;
#[cfg(not(windows))]
impl SystemMedia {
    pub fn new(
        _: Option<usize>,
        _: std::sync::mpsc::Sender<crate::playback::Message>,
    ) -> Result<Self, String> {
        Ok(Self)
    }
    pub fn update(
        &mut self,
        _: &Playback,
        _: Option<&crate::model::Track>,
        _: bool,
        _: bool,
    ) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn time_conversion_rejects_invalid_values_and_clamps_positions() {
        assert_eq!(ticks(f64::NAN), 0);
        assert_eq!(ticks(f64::INFINITY), 0);
        assert_eq!(ticks(-2.0), 0);
        assert_eq!(ticks(1.25), 12_500_000);
        assert_eq!(ticks(f64::MAX), i64::MAX);
        let mut state = Playback::default();
        state.duration = 90.0;
        state.position = 100.0;
        assert_eq!(position(&state), 90.0);
        state.position = -3.0;
        assert_eq!(position(&state), 0.0);
    }
    #[test]
    fn windows_repeat_preserves_the_single_track_stop_mode() {
        assert_eq!(
            external_repeat(&Repeat::Single, SystemRepeat::None),
            Repeat::Single
        );
        assert_eq!(
            external_repeat(&Repeat::All, SystemRepeat::None),
            Repeat::None
        );
        assert_eq!(
            external_repeat(&Repeat::Single, SystemRepeat::Track),
            Repeat::One
        );
        assert_eq!(
            external_repeat(&Repeat::None, SystemRepeat::List),
            Repeat::All
        );
    }
}
