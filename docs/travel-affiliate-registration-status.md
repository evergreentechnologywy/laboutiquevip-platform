# Travel Affiliate Registration Status

Updated: 2026-05-07

## Active / Started

### Travelpayouts

- Dashboard: https://app.travelpayouts.com/dashboard?source=526309
- Programs: https://app.travelpayouts.com/programs?source=526309
- Login email: codexvps@agentmail.to
- Account ID: 725872
- Source ID: 526309
- Project: Laboutiquevip
- Project URL: https://laboutiquevip.net
- Status: account created, email verified, project review pending.
- Notes: Travelpayouts shows 28 available programs, including Klook, Yesim, Kiwitaxi, Localrent, Welcome Pickups, Tiqets, Kiwi.com, Aviasales, KKday, and others.
- Do not blindly install the Drive script in production. Prefer backend-generated discrete links/cards until the script is reviewed.

## Human / Owner Gates

### Travelpayouts Completion

- Gate: account activation for payouts and current login reCAPTCHA.
- Needs: owner payout/business details.

### Busbud via CJ

- Signup: https://signup.cj.com/member/signup/publisher/?cid=5247616#/branded
- CJ branded page: https://public.cj.com/signup/publisher?advertiserId=5247616#/branded
- Advertiser ID: 5247616
- Commission notes shown: 2% commission on orders, 7-day tracking cookie, dynamic banners.
- Gate: CJ publisher signup requires reCAPTCHA and account/legal setup.

### Booking.com via Awin/CJ

- Booking affiliate page: https://www.booking.com/affiliate-program/v2/index.html
- Region selector: https://spadmin.booking.com/pc/sign-up.html
- North America Awin signup: https://www.awin.com/us/advertisers/partner/booking.com
- Booking.com North America Awin program ID visible in URL: 6776
- Commission notes shown on Awin page: 4% on accommodations, 3.8%-6% on cars, $2 on flights.
- Gate: Awin signup requires real owner/address/tax details and legal terms acceptance.

### Skyscanner via impact.com

- Affiliate page: https://www.partners.skyscanner.net/product/affiliates
- impact.com signup: https://app.impact.com/campaign-campaign-info-v2/Skyscanner.brand
- Payout terms shown: 20% on redirects, 40% on bookings, 30-day click referral window.
- Gate: impact.com requires accepting Skyscanner partner offer/legal terms before continuing.

### Expedia Rapid API

- Rapid API page: https://partner.expediagroup.com/en-us/solutions/build-your-travel-experience/rapid-api
- Application page: https://partner.expediagroup.com/en-us/join-us/rapid-api
- Gate: application requires representative info, phone, job title, company details, turnover ranges, room-night turnover, API integration history, and permission choices.

### Omio

- Affiliate page: https://www.omio.co.uk/affiliate
- Gate: Cloudflare browser/security verification blocked automated access.

## Implementation Notes

- Travelpayouts metadata has been stored in app and shared agent env files using `TRAVELPAYOUTS_*` keys.
- `TRAVELPAYOUTS_DRIVE_SCRIPT_URL` is stored for review only. Avoid global script injection until its behavior and privacy impact are approved.
- For the La Boutique VIP assistant, the lowest-risk first implementation is to use Travelpayouts program links/cards for city and tour suggestions, then add direct provider APIs only after each provider approves the account.
