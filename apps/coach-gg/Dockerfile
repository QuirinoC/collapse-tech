FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /app
COPY src/CoachGG.csproj .
RUN dotnet restore
COPY src/ .
RUN dotnet publish CoachGG.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /out .
COPY src/static ./static
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
USER $APP_UID
ENTRYPOINT ["dotnet", "CoachGG.dll"]
