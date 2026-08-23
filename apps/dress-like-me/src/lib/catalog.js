export const featuredPeople = [
  {
    name: "Shia LaBeouf",
    slug: "shia-labeouf",
    initials: "SL",
    palette: "clay",
    rank: 98,
    description:
      "Workwear, thrift-store sportswear, hard-worn boots, and proportions that look accidental until you try them.",
    tags: ["Workwear", "Normcore", "Vintage sports"],
    aliases: ["shia", "shia labeouf", "shia lebeouf"],
  },
  {
    name: "Zendaya",
    slug: "zendaya",
    initials: "Z",
    palette: "wine",
    rank: 94,
    description:
      "Precise tailoring, archival references, and silhouettes built for the whole room.",
    tags: ["Tailoring", "Archival", "Red carpet"],
    aliases: ["zendaya", "zendaya coleman"],
  },
  {
    name: "A$AP Rocky",
    slug: "asap-rocky",
    initials: "AR",
    palette: "moss",
    rank: 91,
    description:
      "Runway pieces loosened up with streetwear, jewelry, and fearless color.",
    tags: ["Streetwear", "Luxury", "Color"],
    aliases: ["asap rocky", "a$ap rocky", "rocky"],
  },
  {
    name: "Emma Chamberlain",
    slug: "emma-chamberlain",
    initials: "EC",
    palette: "blue",
    rank: 87,
    description:
      "Internet-era vintage, tiny tops, odd accessories, and an instinct for the next silhouette.",
    tags: ["Vintage", "Playful", "Internet"],
    aliases: ["emma", "emma chamberlain"],
  },
];

export const outfits = [
  {
    id: "shia-airport-layers",
    personSlug: "shia-labeouf",
    personName: "Shia LaBeouf",
    title: "Airport layers, no performance",
    sourceLabel: "Editorial reference",
    sourceUrl:
      "https://www.google.com/search?q=Shia+LaBeouf+airport+street+style",
    palette: "clay",
    date: "Aug 18",
    garments: [
      {
        id: "shia-jacket",
        name: "Cropped work jacket",
        detail: "Washed canvas / boxy fit / tobacco",
        confidence: 0.91,
        query: "mens washed canvas cropped work jacket brown",
        products: [
          {
            title: "Canvas chore jacket",
            merchant: "Amazon",
            price: "$48",
            url: "https://www.amazon.com/s?k=mens+washed+canvas+chore+jacket",
          },
          {
            title: "Washed workwear jacket",
            merchant: "Google Shopping",
            price: "Compare",
            url: "https://www.google.com/search?tbm=shop&q=washed+workwear+jacket+men",
          },
        ],
      },
      {
        id: "shia-sweatshirt",
        name: "Heather crewneck",
        detail: "Midweight fleece / relaxed / grey",
        confidence: 0.95,
        query: "mens heather gray relaxed crewneck sweatshirt",
        products: [
          {
            title: "Relaxed fleece crewneck",
            merchant: "Amazon",
            price: "$24",
            url: "https://www.amazon.com/s?k=mens+heather+gray+crewneck+sweatshirt",
          },
        ],
      },
      {
        id: "shia-trousers",
        name: "Pleated fatigue trouser",
        detail: "Cotton twill / wide taper / olive",
        confidence: 0.86,
        query: "mens olive pleated fatigue pants wide taper",
        products: [
          {
            title: "Olive fatigue trouser",
            merchant: "Google Shopping",
            price: "Compare",
            url: "https://www.google.com/search?tbm=shop&q=mens+olive+fatigue+trouser",
          },
        ],
      },
      {
        id: "shia-boots",
        name: "Service boot",
        detail: "Worn leather / round toe / dark brown",
        confidence: 0.79,
        query: "mens dark brown leather service boots round toe",
        products: [
          {
            title: "Brown leather service boot",
            merchant: "Amazon",
            price: "$72",
            url: "https://www.amazon.com/s?k=mens+brown+leather+service+boots",
          },
        ],
      },
    ],
  },
  {
    id: "zendaya-sculpted-suit",
    personSlug: "zendaya",
    personName: "Zendaya",
    title: "The sculpted monochrome suit",
    sourceLabel: "Editorial reference",
    sourceUrl: "https://www.google.com/search?q=Zendaya+monochrome+suit+style",
    palette: "wine",
    date: "Aug 15",
    garments: [
      {
        id: "zendaya-blazer",
        name: "Waisted blazer",
        detail: "Structured wool / peak lapel / oxblood",
        confidence: 0.92,
        query: "womens oxblood fitted peak lapel blazer",
        products: [],
      },
      {
        id: "zendaya-trouser",
        name: "Fluid wide trouser",
        detail: "High rise / full length / tonal",
        confidence: 0.9,
        query: "womens oxblood high rise wide leg trousers",
        products: [],
      },
    ],
  },
  {
    id: "rocky-varsity-clash",
    personSlug: "asap-rocky",
    personName: "A$AP Rocky",
    title: "Varsity volume with a tie",
    sourceLabel: "Editorial reference",
    sourceUrl: "https://www.google.com/search?q=ASAP+Rocky+varsity+jacket+style",
    palette: "moss",
    date: "Aug 11",
    garments: [
      {
        id: "rocky-varsity",
        name: "Oversized varsity jacket",
        detail: "Leather sleeves / felt body / forest",
        confidence: 0.94,
        query: "mens oversized green varsity jacket leather sleeves",
        products: [],
      },
      {
        id: "rocky-shirt",
        name: "Striped dress shirt",
        detail: "Fine stripe / pointed collar / blue",
        confidence: 0.88,
        query: "mens blue fine stripe pointed collar shirt",
        products: [],
      },
    ],
  },
];

export function findPerson(slug) {
  return featuredPeople.find((person) => person.slug === slug) || null;
}

export function findOutfit(id) {
  return outfits.find((outfit) => outfit.id === id) || null;
}

export function searchCatalog(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return featuredPeople
    .filter((person) =>
      [person.name, ...person.aliases, ...person.tags].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    )
    .sort((a, b) => b.rank - a.rank);
}

export function getOutfitsForPerson(slug) {
  return outfits.filter((outfit) => outfit.personSlug === slug);
}
