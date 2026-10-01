use serde_json::Value;

#[derive(Debug, PartialEq, Eq)]
pub enum HealthParse {
    Ok,
    Starting,
    Other(String),
    Unparseable,
}

pub fn parse_health_response(raw_http: &str) -> HealthParse {
    let Some((headers, body)) = raw_http.split_once("\r\n\r\n") else {
        return HealthParse::Unparseable;
    };
    let Some(status_line) = headers.lines().next() else {
        return HealthParse::Unparseable;
    };
    if !status_line
        .split_whitespace()
        .nth(1)
        .is_some_and(|s| s == "200")
    {
        return HealthParse::Unparseable;
    }
    let chunked = headers.lines().any(|line| {
        let Some((key, value)) = line.split_once(':') else {
            return false;
        };
        key.eq_ignore_ascii_case("transfer-encoding")
            && value.to_ascii_lowercase().contains("chunked")
    });
    let decoded;
    let body = if chunked {
        let Some(bytes) = decode_chunked(body.as_bytes()) else {
            return HealthParse::Unparseable;
        };
        decoded = bytes;
        match std::str::from_utf8(&decoded) {
            Ok(s) => s,
            Err(_) => return HealthParse::Unparseable,
        }
    } else {
        body
    };
    let Ok(json) = serde_json::from_str::<Value>(body.trim()) else {
        return HealthParse::Unparseable;
    };
    match json.get("status").and_then(Value::as_str) {
        Some("ok") => HealthParse::Ok,
        Some("starting") => HealthParse::Starting,
        Some(other) => HealthParse::Other(other.to_owned()),
        None => HealthParse::Unparseable,
    }
}

fn decode_chunked(input: &[u8]) -> Option<Vec<u8>> {
    let mut remaining = input;
    let mut result = Vec::new();
    loop {
        let line_end = remaining.windows(2).position(|w| w == b"\r\n")?;
        let size_text = std::str::from_utf8(&remaining[..line_end])
            .ok()?
            .split(';')
            .next()?;
        let size = usize::from_str_radix(size_text.trim(), 16).ok()?;
        remaining = &remaining[line_end + 2..];
        if size == 0 {
            return Some(result);
        }
        let Some(frame_len) = size.checked_add(2) else {
            return None;
        };
        if remaining.len() < frame_len || &remaining[size..frame_len] != b"\r\n" {
            return None;
        }
        result.extend_from_slice(&remaining[..size]);
        remaining = &remaining[size + 2..];
    }
}
