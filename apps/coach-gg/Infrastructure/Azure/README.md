# CoachGG Azure deployment

CoachGG runs in Azure Container Apps with the ASP.NET Core SignalR SDK hosted directly in the application. It does not provision or use Azure SignalR Service.

The app is deliberately configured with `minReplicas: 0` and `maxReplicas: 1`:

- Idle compute scales to zero, so there is no always-on replica charge.
- The first request after an idle period incurs a cold start.
- A single-replica ceiling is required because SignalR groups and active analysis-job ownership are currently process-local. Do not raise it until a distributed SignalR backplane and distributed job lease are implemented.

The deployment reuses an existing consumption Container Apps environment and Azure Container Registry. The resource group and user-assigned identities have no baseline charge. A Redis sidecar runs in the same scale-to-zero replica, so it has no separate always-on service charge.

Redis data is ephemeral and is cleared whenever the replica scales to zero. This is intentional: cached games and job state are performance optimizations, while the app is already limited to one process-local analysis worker.

## Azure prerequisites

1. Create a resource group and a runtime user-assigned identity.
2. Grant the runtime identity `AcrPull` on the existing registry.
3. Create a deployment user-assigned identity with a GitHub federated credential restricted to this repository's `production` environment.
4. Grant the deployment identity `Contributor` on the CoachGG resource group and `AcrPush` on the registry.
5. Configure the GitHub `production` environment.

Environment variables:

- `COACHGG_AZURE_CLIENT_ID`
- `COACHGG_AZURE_TENANT_ID`
- `COACHGG_AZURE_SUBSCRIPTION_ID`
- `COACHGG_AZURE_RESOURCE_GROUP`
- `COACHGG_AZURE_LOCATION`
- `COACHGG_ACR_NAME`
- `COACHGG_ACR_RESOURCE_ID`
- `COACHGG_CONTAINER_ENVIRONMENT_ID`
- `COACHGG_RUNTIME_IDENTITY_ID`
- `COACHGG_CUSTOM_DOMAIN_NAME`
- `COACHGG_CUSTOM_DOMAIN_CERTIFICATE_ID`

Environment secrets:

- `COACHGG_STARTGG_API_KEY`

Run **Deploy CoachGG** manually. The workflow builds only `apps/coach-gg`, resolves the pushed image to an immutable digest, validates the Bicep deployment, and deploys the scale-to-zero app.

The workflow briefly bootstraps a new app with a public Microsoft sample image so Azure can attach and resolve its pull identity before the first private ACR deployment. No custom domain is attached at this stage, the production image replaces it in the same workflow run, and every subsequent deployment skips this step.

## Custom domain

After the first deployment, create these records with the authoritative DNS provider:

- `coach.collapsetechnologies.com` CNAME to the workflow's `appFqdn` output.
- `asuid.coach.collapsetechnologies.com` TXT containing the `customDomainVerificationId` output.

Then bind a free managed certificate:

```bash
az containerapp hostname add \
  --resource-group "$COACHGG_AZURE_RESOURCE_GROUP" \
  --name coachgg \
  --hostname coach.collapsetechnologies.com

az containerapp hostname bind \
  --resource-group "$COACHGG_AZURE_RESOURCE_GROUP" \
  --name coachgg \
  --environment "$COACHGG_CONTAINER_ENVIRONMENT_ID" \
  --hostname coach.collapsetechnologies.com \
  --validation-method CNAME
```

Set the resulting hostname and managed certificate resource ID in the two
custom-domain environment variables above. Subsequent Bicep deployments preserve
the binding.
