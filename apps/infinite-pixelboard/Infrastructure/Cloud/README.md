# How to get deployed to cloud

- Run Common infra pipeline first

Deployment will fail the first time due to cross rg deployment

Add the MI to the rg containing the ACR
```
# Get the managed identity principal ID
principalId=$(az identity show -g pixelboard -n pixelboardid --query principalId -o tsv)

# Create role assignment
az role assignment create \
  --assignee-object-id "$principalId" \
  --role "AcrPull" \
  --scope "/subscriptions/1173a707-87ca-4aa8-a0ea-b1fc0a1a1609/resourcegroups/autocontent"
```
