const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

const getBrowser = async () => {
  if (process.env.NODE_ENV === "production") {
    // For Render.com or other Linux-based environments
    return puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
      ],
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome",
    });
  } else {
    // For local development (Mac or other environments)
    return puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
};

async function waitForMatchesToLoad(page) {
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll("app-matches-list-item");
      return items.length > 0;
    },
    { timeout: 30000 }
  );
}

async function loginToLeetify() {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    // Navigate to the Leetify login page
    await page.goto("https://leetify.com/login");

    // Wait for the email input field to be visible
    await page.waitForSelector('input[type="email"]');

    // Type in the email and password
    await page.type('input[type="email"]', "m.jaskolowski1994@gmail.com");
    await page.type('input[type="password"]', "Creative12345!");

    // Click the login button
    await page.click('button[type="submit"]');

    // Wait for navigation to complete
    await page.waitForNavigation();

    await page.goto("https://leetify.com/app/matches/list");

    // Wait for matches to load
    await waitForMatchesToLoad(page);

    const matchIds = await page.evaluate(() => {
      const matchElements = document.querySelectorAll(
        "app-matches-list-item a"
      );
      return Array.from(matchElements).map((element) => {
        const href = element.getAttribute("href");
        return href.split("/").pop();
      });
    });

    return matchIds;
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

const getStats = async (gameID) => {
  const match = await fetch(`https://api.leetify.com/api/games/${gameID}`);
  const data = await match.json();
  const map = data.mapName;
  const score = data.teamScores;
  const players = data.playerStats.filter(
    (item) =>
      item.steam64Id === "76561198002392306" ||
      item.steam64Id === "76561198040886804"
  );
  let matchWon = null;
  const refactoredPlayer = players.map(
    ({
      name,
      accuracy,
      totalDamage,
      totalKills,
      totalDeaths,
      totalAssists,
      kdRatio,
      tRoundsWon = Number(tRoundsWon),
      ctRoundsWon = Number(ctRoundsWon),
      tRoundsLost = Number(tRoundsLost),
      ctRoundsLost = Number(ctRoundsLost),
    }) => {
      if (tRoundsWon + ctRoundsWon > tRoundsLost + ctRoundsLost) {
        matchWon = true;
      } else if (tRoundsWon + ctRoundsWon < tRoundsLost + ctRoundsLost) {
        matchWon = false;
      }

      return {
        name,
        accuracy,
        totalKills,
        totalAssists,
        totalDeaths,
        totalDamage,
        kdRatio,
      };
    }
  );

  return [...refactoredPlayer, { map, score, matchWon }];
};

const fetchAllStats = async () => {
  try {
    const gamesArray = await loginToLeetify();
    const allStats = await Promise.all(gamesArray.map(getStats));
    return allStats;
  } catch (error) {
    console.error("Error fetching all stats:", error);
  }
};

// Routes
app.get("/", (req, res) => {
  res.send("Leetify Scraper API is running");
});

app.get("/matches", async (req, res) => {
  try {
    const matches = await loginToLeetify();
    res.json(matches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred while fetching matches" });
  }
});

app.get("/stats", async (req, res) => {
  try {
    const stats = await fetchAllStats();
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred while fetching stats" });
  }
});

app.listen(port, () => {
  console.log(`Leetify Scraper API listening at http://localhost:${port}`);
});
