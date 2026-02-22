pub fn apply_daily_window(now: i64, last_reset_ts: i64, current_spend: u64) -> (u64, i64) {
    if now - last_reset_ts > 86_400 {
        (0, now)
    } else {
        (current_spend, last_reset_ts)
    }
}

#[cfg(test)]
mod tests {
    use super::apply_daily_window;

    #[test]
    fn reset_after_more_than_24h() {
        let now = 200_001;
        let last_reset_ts = 100_000;
        let current_spend = 500;

        let (effective_spend, next_reset_ts) =
            apply_daily_window(now, last_reset_ts, current_spend);

        assert_eq!(effective_spend, 0);
        assert_eq!(next_reset_ts, now);
    }

    #[test]
    fn no_reset_within_window() {
        let now = 186_399;
        let last_reset_ts = 100_000;
        let current_spend = 500;

        let (effective_spend, next_reset_ts) =
            apply_daily_window(now, last_reset_ts, current_spend);

        assert_eq!(effective_spend, current_spend);
        assert_eq!(next_reset_ts, last_reset_ts);
    }

    #[test]
    fn exact_86400_boundary_does_not_reset() {
        let now = 186_400;
        let last_reset_ts = 100_000;
        let current_spend = 500;

        let (effective_spend, next_reset_ts) =
            apply_daily_window(now, last_reset_ts, current_spend);

        assert_eq!(effective_spend, current_spend);
        assert_eq!(next_reset_ts, last_reset_ts);
    }
}
