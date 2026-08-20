# Collapse Technologies

The workspace behind [collapsetechnologies.com](https://collapsetechnologies.com): an independent technology studio making software, games, and long-term platforms.

## Applications

| Application | Directory | Purpose |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | Studio landing site |
| Asymmetric Challenge | `apps/asymmetric-challenge` | 256-bit key challenge experiment |

## Local development

Each application owns its dependencies and can run independently:

```bash
npm --prefix apps/collapse-technologies install
npm run dev:studio
```

```bash
npm --prefix apps/asymmetric-challenge install
npm run dev:challenge
```

Root scripts run the relevant command in each app:

```bash
npm run build
npm run lint
npm test
```

## Vercel deployments

Create two Vercel projects from this repository. In each project, set **Root Directory** before deploying:

| Vercel project | Root Directory | Production domain |
| --- | --- | --- |
| Collapse Technologies | `apps/collapse-technologies` | `collapsetechnologies.com` |
| Asymmetric Challenge | `apps/asymmetric-challenge` | Configure separately |

Vercel automatically detects Next.js from the selected root directory. The challenge's existing Supabase environment variables belong only to the Asymmetric Challenge project; they must not be added to the studio project.
