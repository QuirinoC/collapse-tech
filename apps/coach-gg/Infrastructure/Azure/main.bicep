@description('Azure region for the Container App. It must match the managed environment.')
param location string = resourceGroup().location

@description('Immutable ACR image reference in repository@sha256:digest form.')
param containerImage string

@description('Resource ID of the existing Azure Container Apps managed environment.')
param environmentResourceId string

@description('Resource ID of the user-assigned identity with AcrPull access.')
param runtimeIdentityResourceId string

@description('ACR login server, for example example.azurecr.io.')
param registryServer string

@secure()
@description('start.gg personal access token.')
param startGGApiKey string

@description('Deployment identifier used to force a new revision for configuration-only changes.')
param deploymentRevision string = 'manual'

resource coachGG 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'coachgg'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentityResourceId}': {}
    }
  }
  properties: {
    environmentId: environmentResourceId
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8080
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          identity: runtimeIdentityResourceId
        }
      ]
      secrets: [
        {
          name: 'startgg-api-key'
          value: startGGApiKey
        }
      ]
    }
    template: {
      revisionSuffix: deploymentRevision
      containers: [
        {
          name: 'coachgg'
          image: containerImage
          env: [
            {
              name: 'ASPNETCORE_ENVIRONMENT'
              value: 'Production'
            }
            {
              name: 'ASPNETCORE_URLS'
              value: 'http://+:8080'
            }
            {
              name: 'STARTGG_APIKEY'
              secretRef: 'startgg-api-key'
            }
            {
              name: 'REDIS_URL'
              value: 'localhost:6379,abortConnect=false'
            }
            {
              name: 'DEPLOYMENT_REVISION'
              value: deploymentRevision
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              timeoutSeconds: 5
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 8080
                scheme: 'HTTP'
              }
              initialDelaySeconds: 5
              periodSeconds: 10
              timeoutSeconds: 5
              failureThreshold: 6
            }
          ]
        }
        {
          name: 'redis'
          image: 'redis:7.4-alpine'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

output appName string = coachGG.name
output appFqdn string = coachGG.properties.configuration.ingress.fqdn
output customDomainVerificationId string = coachGG.properties.customDomainVerificationId
