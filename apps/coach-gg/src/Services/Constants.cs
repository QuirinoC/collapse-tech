namespace CoachGG.Services;

public static class Constants
{
    public const string StartGGHost = "https://api.start.gg/gql/alpha";

    // Bump when PlayerStats schema changes — busts stale Redis job state cache
    public const string StatsVersion = "v4";

    // Characters to exclude from all stats (random/placeholder selections)
    public static readonly HashSet<string> SkipCharacters = new() { "TBD", "Random Character" };
    public static readonly Dictionary<int, string> UltimateCharacters = new()
    {
        { 1886, "TBD" }, { 1885, "TBD" },
        { 1271, "Bayonetta" }, { 1272, "Bowser Jr." }, { 1273, "Bowser" },
        { 1274, "Captain Falcon" }, { 1275, "Cloud" }, { 1276, "Corrin" },
        { 1277, "Daisy" }, { 1278, "Dark Pit" }, { 1279, "Diddy Kong" },
        { 1280, "Donkey Kong" }, { 1282, "Dr. Mario" }, { 1283, "Duck Hunt" },
        { 1285, "Falco" }, { 1286, "Fox" }, { 1287, "Ganondorf" },
        { 1289, "Greninja" }, { 1290, "Ice Climbers" }, { 1291, "Ike" },
        { 1292, "Inkling" }, { 1293, "Jigglypuff" }, { 1294, "King Dedede" },
        { 1295, "Kirby" }, { 1296, "Link" }, { 1297, "Little Mac" },
        { 1298, "Lucario" }, { 1299, "Lucas" }, { 1300, "Lucina" },
        { 1301, "Luigi" }, { 1302, "Mario" }, { 1304, "Marth" },
        { 1305, "Mega Man" }, { 1307, "Meta Knight" }, { 1310, "Mewtwo" },
        { 1311, "Mii Brawler" }, { 1313, "Ness" }, { 1314, "Olimar" },
        { 1315, "Pac-Man" }, { 1316, "Palutena" }, { 1317, "Peach" },
        { 1318, "Pichu" }, { 1319, "Pikachu" }, { 1320, "Pit" },
        { 1321, "Pokemon Trainer" }, { 1322, "Ridley" }, { 1323, "R.O.B." },
        { 1324, "Robin" }, { 1325, "Rosalina" }, { 1326, "Roy" },
        { 1327, "Ryu" }, { 1328, "Samus" }, { 1329, "Sheik" },
        { 1330, "Shulk" }, { 1331, "Snake" }, { 1332, "Sonic" },
        { 1333, "Toon Link" }, { 1334, "Villager" }, { 1335, "Wario" },
        { 1336, "Wii Fit Trainer" }, { 1337, "Wolf" }, { 1338, "Yoshi" },
        { 1339, "Young Link" }, { 1340, "Zelda" }, { 1341, "Zero Suit Samus" },
        { 1405, "Mr. Game & Watch" }, { 1406, "Incineroar" }, { 1407, "King K. Rool" },
        { 1408, "Dark Samus" }, { 1409, "Chrom" }, { 1410, "Ken" },
        { 1411, "Simon Belmont" }, { 1412, "Richter" }, { 1413, "Isabelle" },
        { 1414, "Mii Swordfighter" }, { 1415, "Mii Gunner" },
        { 1441, "Piranha Plant" }, { 1453, "Joker" }, { 1526, "Hero" },
        { 1530, "Banjo-Kazooie" }, { 1532, "Terry" }, { 1539, "Byleth" },
        { 1746, "Random Character" }, { 1747, "Min Min" }, { 1766, "Steve" },
        { 1777, "Sephiroth" }, { 1795, "Pyra & Mythra" }, { 1846, "Kazuya" },
        { 1897, "Sora" }
    };
}
