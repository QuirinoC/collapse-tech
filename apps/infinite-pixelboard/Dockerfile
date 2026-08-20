# Stage 1: Build
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy and restore dependencies
COPY ["PixelBoard.csproj", "PixelBoard.csproj"]
RUN dotnet restore "PixelBoard.csproj"

# Copy the rest of the files and build
COPY . .
WORKDIR "/src"
RUN dotnet build "PixelBoard.csproj" -c Release -o /app/build
RUN dotnet publish "PixelBoard.csproj" -c Release -o /app/publish

# Stage 2: Run
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Set environment to Production explicitly
ENV ASPNETCORE_ENVIRONMENT=Production

# Expose port and run
EXPOSE 8080
EXPOSE 443
ENTRYPOINT ["dotnet", "PixelBoard.dll"]