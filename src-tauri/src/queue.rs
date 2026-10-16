use std::collections::HashSet;

pub fn reorder(current: &[String], ids: Vec<String>) -> Result<Vec<String>, String> {
    let expected: HashSet<_> = current.iter().collect();
    let actual: HashSet<_> = ids.iter().collect();
    if ids.len() > 100_000
        || ids.len() != current.len()
        || actual.len() != ids.len()
        || actual != expected
    {
        return Err("Очередь изменилась. Попробуйте переставить трек ещё раз.".into());
    }
    Ok(ids)
}
pub fn clear_next(queue: &mut Vec<String>, current: Option<&str>) {
    let keep = current
        .and_then(|id| queue.iter().position(|v| v == id))
        .map_or(0, |i| i + 1);
    queue.truncate(keep);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_stale_or_injected_reorders_and_keeps_the_playhead_on_clear() {
        let queue = vec!["a".into(), "b".into(), "c".into()];
        assert!(reorder(&queue, vec!["c".into(), "a".into(), "b".into()]).is_ok());
        for invalid in [
            vec!["a".into()],
            vec!["a".into(), "a".into(), "c".into()],
            vec!["x".into(), "b".into(), "c".into()],
        ] {
            assert!(reorder(&queue, invalid).is_err());
        }
        let mut after = queue.clone();
        clear_next(&mut after, Some("b"));
        assert_eq!(after, vec!["a", "b"]);
        clear_next(&mut after, None);
        assert!(after.is_empty());
    }
}
