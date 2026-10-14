"""Fetch a GitHub user's contribution calendar and save it as JSON for the site.

Runs inside the GitHub Action in .github/workflows/deploy.yml. It calls GitHub's
official GraphQL API with the token the Action provides, so nothing secret ever
reaches the website: the page only reads the finished JSON file.

Usage: python scripts/fetch_contributions.py <login> <output path>
Needs the environment variable GITHUB_TOKEN.
"""
import datetime
import json
import os
import sys
import urllib.request

API_URL = "https://api.github.com/graphql"

QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount contributionLevel }
        }
      }
    }
  }
}
"""

# GitHub describes each day's shade as a word; the site wants a number from 0 to 4.
LEVELS = {
    "NONE": 0,
    "FIRST_QUARTILE": 1,
    "SECOND_QUARTILE": 2,
    "THIRD_QUARTILE": 3,
    "FOURTH_QUARTILE": 4,
}


def fetch_calendar(login, token):
    """Ask GitHub's API for the calendar and return the raw JSON response."""
    body = json.dumps({"query": QUERY, "variables": {"login": login}}).encode()
    request = urllib.request.Request(
        API_URL,
        data=body,
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def to_site_format(login, response, now=None):
    """Turn GitHub's response into the small shape the page draws from."""
    if response.get("errors"):
        raise RuntimeError("GitHub API error: " + json.dumps(response["errors"]))
    user = (response.get("data") or {}).get("user")
    if user is None:
        raise RuntimeError("No GitHub user called " + login)
    calendar = user["contributionsCollection"]["contributionCalendar"]
    weeks = [
        [
            {"date": day["date"], "count": day["contributionCount"],
             "level": LEVELS.get(day["contributionLevel"], 0)}
            for day in week["contributionDays"]
        ]
        for week in calendar["weeks"]
    ]
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return {
        "login": login,
        "total": calendar["totalContributions"],
        "updated": now.strftime("%Y-%m-%d"),
        "weeks": weeks,
    }


def main():
    if len(sys.argv) != 3:
        sys.exit("Usage: python scripts/fetch_contributions.py <login> <output path>")
    login, out_path = sys.argv[1], sys.argv[2]
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        sys.exit("GITHUB_TOKEN is not set")
    data = to_site_format(login, fetch_calendar(login, token))
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("Saved {} contributions for {} to {}".format(data["total"], login, out_path))


if __name__ == "__main__":
    main()
