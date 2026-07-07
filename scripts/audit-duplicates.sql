-- Duplicate providers by normalized name + city + state (active only)
SELECT lower(trim(regexp_replace(display_name, '[^a-zA-Z0-9 ]', '', 'g'))) AS norm_name,
       lower(trim(location_city)) AS city,
       lower(trim(coalesce(location_state, ''))) AS state,
       count(*) AS cnt
FROM "Provider"
WHERE status = 'active' AND is_profile_approved = true
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY cnt DESC
LIMIT 50;

-- Duplicate verification_url (any status)
SELECT lower(trim(regexp_replace(verification_url, '\?.*$', ''))) AS canon_url,
       count(*) AS cnt
FROM "Provider"
WHERE verification_provider = 'eros' AND verification_url IS NOT NULL
GROUP BY 1
HAVING count(*) > 1
ORDER BY cnt DESC
LIMIT 30;
