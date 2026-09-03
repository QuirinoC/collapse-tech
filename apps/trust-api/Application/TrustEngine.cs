using TrustApi.Domain;

namespace TrustApi.Application;

public sealed class TrustEngine(ITrustStore store, TimeProvider time)
{
    public async Task<Account> SignInAsync(
        string provider,
        string subject,
        string displayName,
        CancellationToken cancellationToken)
    {
        var existing = await store.FindByProviderAsync(provider, subject, cancellationToken);
        if (existing is not null)
        {
            if (!string.Equals(existing.DisplayName, displayName, StringComparison.Ordinal)
                && !string.Equals(displayName, "You", StringComparison.Ordinal)
                && !string.IsNullOrWhiteSpace(displayName))
            {
                var renamed = existing with { DisplayName = displayName.Trim() };
                await store.UpdateAccountAsync(renamed, cancellationToken);
                return renamed;
            }

            return existing;
        }

        var now = time.GetUtcNow();
        var account = new Account(
            Guid.NewGuid(),
            provider,
            subject,
            string.IsNullOrWhiteSpace(displayName) ? "You" : displayName.Trim(),
            false,
            null,
            now);
        account = await store.UpsertAccountAsync(account, cancellationToken);
        await store.UpsertPresenceAsync(
            account.Id,
            new Presence(now, 80, false, null, null),
            cancellationToken);
        return account;
    }

    public async Task<CircleSnapshot> GetCircleAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var now = time.GetUtcNow();
        var connected = await store.ListConnectedAsync(accountId, cancellationToken);
        var coverage = CoverageOf(you, connected);
        var members = new List<CircleMember>();
        LookSession? activeSession = null;
        var yourHome = await store.GetHomePlaceAsync(you.Id, cancellationToken);
        var yourPresence = await store.GetCurrentHomePresenceAsync(you.Id, cancellationToken);

        foreach (var person in connected)
        {
            var outbound = await store.GetShareAsync(you.Id, person.Id, cancellationToken);
            var inbound = await store.GetShareAsync(person.Id, you.Id, cancellationToken);
            var active = await RequireLiveActiveLookAsync(you.Id, person.Id, cancellationToken);
            var inboundLive = inbound.RevealsLive(now) || active is not null;
            LocationFix? live = null;
            if (inboundLive)
            {
                live = await store.LatestLocationAsync(person.Id, cancellationToken);
            }

            // Battery / last-active / got-home only while Looking or Always / For a while.
            Presence? presence = inboundLive
                ? await store.GetPresenceAsync(person.Id, now, cancellationToken)
                : null;

            var outboundGrant = await store.GetPresenceGrantAsync(you.Id, person.Id, cancellationToken);
            var inboundGrant = await store.GetPresenceGrantAsync(person.Id, you.Id, cancellationToken);
            var outboundPresenceGranted = outboundGrant?.Enabled == true;
            var inboundPresenceGranted = inboundGrant?.Enabled == true;

            VisibleHomePresence? homePresence = null;
            if (inboundPresenceGranted)
            {
                var current = await store.GetCurrentHomePresenceAsync(person.Id, cancellationToken);
                var place = await store.GetHomePlaceAsync(person.Id, cancellationToken);
                if (current is not null)
                {
                    homePresence = new VisibleHomePresence(
                        current.State,
                        current.LastChangedAt,
                        place?.Label);
                }
            }

            var promiseView = await BuildPromiseViewAsync(you.Id, person.Id, cancellationToken);

            members.Add(new CircleMember(
                person,
                presence,
                outbound,
                inboundLive,
                live,
                outboundPresenceGranted,
                inboundPresenceGranted,
                homePresence,
                promiseView));

            if (active is not null)
            {
                var session = await BuildSessionAsync(you, person, active, cancellationToken);
                if (session is not null)
                {
                    activeSession = session;
                }
            }
        }

        var watched = await RequireLiveLookAtMeAsync(you.Id, cancellationToken);
        LookEvent? beingWatched = null;
        if (watched is not null)
        {
            var viewer = await store.FindAccountAsync(watched.ViewerId, cancellationToken);
            beingWatched = new LookEvent(
                watched.LookId,
                watched.ViewerId,
                viewer?.DisplayName ?? "Someone",
                you.Id,
                you.DisplayName,
                watched.OpenedAt,
                watched.HistoryWindowHours,
                true);
        }

        var since = now.AddDays(-coverage.LookLogDays);
        var log = await store.ListLooksAsync(you.Id, since, cancellationToken);
        var allLog = await store.ListLooksAsync(you.Id, DateTimeOffset.MinValue, cancellationToken);
        var invite = await store.FindPendingInviteAsync(you.Id, cancellationToken);

        return new CircleSnapshot(
            you,
            members,
            coverage,
            invite,
            activeSession,
            beingWatched,
            log,
            Math.Max(0, allLog.Count - log.Count),
            yourHome,
            yourPresence);
    }

    public async Task<Invite> CreateInviteAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var existing = await store.FindPendingInviteAsync(you.Id, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var invite = new Invite(
            Guid.NewGuid(),
            MakeInviteCode(),
            you.Id,
            "pending",
            time.GetUtcNow());
        await store.InsertInviteAsync(invite, cancellationToken);
        return invite;
    }

    public async Task AcceptInviteAsync(Guid accountId, string code, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var normalized = code.Trim().ToUpperInvariant();
        var invite = await store.FindInviteByCodeAsync(normalized, cancellationToken)
            ?? throw TrustException.InvalidCode();
        if (!string.Equals(invite.Status, "pending", StringComparison.Ordinal))
        {
            throw TrustException.InvalidCode();
        }

        if (invite.CreatorId == you.Id)
        {
            throw new TrustException("own_invite", "You cannot join your own invite.");
        }

        if (await store.AreConnectedAsync(you.Id, invite.CreatorId, cancellationToken))
        {
            await store.MarkInviteConsumedAsync(invite.Id, cancellationToken);
            return;
        }

        var creator = await RequireAccount(invite.CreatorId, cancellationToken);
        await EnsureSeatAsync(you, creator, cancellationToken);
        await store.InsertMembershipAsync(you.Id, creator.Id, cancellationToken);
        await store.UpsertShareAsync(you.Id, creator.Id, ShareState.Default, cancellationToken);
        await store.UpsertShareAsync(creator.Id, you.Id, ShareState.Default, cancellationToken);
        await store.MarkInviteConsumedAsync(invite.Id, cancellationToken);
    }

    public async Task SetShareAsync(
        Guid accountId,
        Guid granteeId,
        ShareResting? resting,
        TimedShareDuration? timed,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        if (!await store.AreConnectedAsync(you.Id, granteeId, cancellationToken))
        {
            throw TrustException.NotConnected();
        }

        var current = await store.GetShareAsync(you.Id, granteeId, cancellationToken);
        var now = time.GetUtcNow();
        var presentation = current.Presentation(now);
        var nextResting = resting ?? current.Resting;
        DateTimeOffset? timedUntil = null;
        if (timed is { } duration)
        {
            var revert = presentation switch
            {
                SharePresentation.Always => ShareResting.Always,
                SharePresentation.Timed(_, ShareResting.Always) => ShareResting.Always,
                _ => ShareResting.UntilTheyLook
            };
            nextResting = revert;
            timedUntil = TimedShare.EndAt(duration, now);
        }

        if (resting is not null && timed is null)
        {
            timedUntil = null;
            nextResting = resting.Value;
        }

        await store.UpsertShareAsync(
            you.Id,
            granteeId,
            new ShareState(nextResting, timedUntil),
            cancellationToken);
    }

    public Task IngestAsync(
        Guid accountId,
        LocationFix fix,
        int? batteryPercent,
        bool? isCharging,
        CancellationToken cancellationToken) =>
        IngestManyAsync(accountId, [fix], batteryPercent, isCharging, cancellationToken);

    public async Task IngestManyAsync(
        Guid accountId,
        IReadOnlyList<LocationFix> fixes,
        int? batteryPercent,
        bool? isCharging,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var connected = await store.ListConnectedAsync(you.Id, cancellationToken);
        if (connected.Count == 0)
        {
            await store.ClearLocationsAsync(you.Id, cancellationToken);
            return;
        }

        var now = time.GetUtcNow();
        var cutoff = now - TrustRules.LocationRetention;
        LocationFix? latest = null;
        foreach (var raw in fixes.OrderBy(fix => fix.Timestamp))
        {
            var recorded = raw.Timestamp;
            if (recorded > now.AddMinutes(2))
            {
                recorded = now;
            }

            if (recorded < cutoff)
            {
                continue;
            }

            var fix = raw with { Timestamp = recorded };
            await store.IngestLocationAsync(you.Id, fix, cancellationToken);
            latest = fix;
        }

        await store.PruneLocationsAsync(you.Id, cutoff, cancellationToken);
        if (latest is null)
        {
            return;
        }

        var presence = await store.GetPresenceAsync(you.Id, latest.Timestamp, cancellationToken);
        var gotHome = LocationTrail.IsNearHome(latest) ? latest.Timestamp : presence.GotHomeAt;
        await store.UpsertPresenceAsync(
            you.Id,
            presence with
            {
                LastActiveAt = latest.Timestamp,
                BatteryPercent = batteryPercent ?? presence.BatteryPercent,
                IsCharging = isCharging ?? presence.IsCharging,
                GotHomeAt = gotHome
            },
            cancellationToken);
    }

    public async Task<LookResult> LookAsync(
        Guid viewerId,
        Guid subjectId,
        bool confirmed,
        CancellationToken cancellationToken)
    {
        if (!confirmed)
        {
            throw TrustException.ConfirmationRequired();
        }

        var viewer = await RequireAccount(viewerId, cancellationToken);
        var subject = await RequireAccount(subjectId, cancellationToken);
        if (!await store.AreConnectedAsync(viewer.Id, subject.Id, cancellationToken))
        {
            throw TrustException.NotConnected();
        }

        var existing = await RequireLiveActiveLookAsync(viewer.Id, subject.Id, cancellationToken);
        if (existing is not null)
        {
            var reused = await BuildSessionAsync(viewer, subject, existing, cancellationToken)
                ?? throw TrustException.NoLocation();
            return new LookResult(reused, IsNew: false);
        }

        var now = time.GetUtcNow();
        var hours = TrustRules.FreeHistoryHours;
        var from = now.AddHours(-hours);
        var trail = await store.UnlockLocationsAsync(subject.Id, from, now, cancellationToken);
        var live = trail.LastOrDefault() ?? await store.LatestLocationAsync(subject.Id, cancellationToken);
        if (live is null)
        {
            throw TrustException.NoLocation();
        }

        var look = new LookEvent(
            Guid.NewGuid(),
            viewer.Id,
            viewer.DisplayName,
            subject.Id,
            subject.DisplayName,
            now,
            hours,
            true);
        await store.InsertLookEventAsync(look, cancellationToken);
        await store.SetActiveLookAsync(
            new ActiveLook(look.Id, viewer.Id, subject.Id, hours, now),
            cancellationToken);
        return new LookResult(
            new LookSession(look, live, trail.Count > 0 ? trail : [live]),
            IsNew: true);
    }

    public async Task CloseLookAsync(Guid viewerId, Guid? subjectId, CancellationToken cancellationToken)
    {
        await store.ClearActiveLookAsync(viewerId, subjectId, cancellationToken);
    }

    public async Task<LookSession> ExtendLookAsync(Guid viewerId, Guid subjectId, CancellationToken cancellationToken)
    {
        var snapshot = await GetCircleAsync(viewerId, cancellationToken);
        if (!snapshot.Coverage.CanExtendHistory)
        {
            throw TrustException.ProRequired();
        }

        var viewer = snapshot.You;
        var subject = await RequireAccount(subjectId, cancellationToken);
        var active = await RequireLiveActiveLookAsync(viewer.Id, subject.Id, cancellationToken)
            ?? throw TrustException.PairInactive();
        var now = time.GetUtcNow();
        var hours = TrustRules.ProHistoryHours;
        var trail = await store.UnlockLocationsAsync(subject.Id, now.AddHours(-hours), now, cancellationToken);
        var live = trail.LastOrDefault() ?? throw TrustException.NoLocation();
        var updated = active with { HistoryWindowHours = hours };
        await store.SetActiveLookAsync(updated, cancellationToken);
        await store.UpdateLookEventHistoryHoursAsync(updated.LookId, hours, cancellationToken);
        var look = new LookEvent(
            updated.LookId,
            viewer.Id,
            viewer.DisplayName,
            subject.Id,
            subject.DisplayName,
            updated.OpenedAt,
            hours,
            true);
        return new LookSession(look, live, trail);
    }

    public async Task CheckInAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var presence = await store.GetPresenceAsync(accountId, now, cancellationToken);
        await store.UpsertPresenceAsync(
            accountId,
            presence with { CheckedInAt = now, LastActiveAt = now },
            cancellationToken);
    }

    public async Task PlacePingAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var snapshot = await GetCircleAsync(accountId, cancellationToken);
        if (!snapshot.Coverage.HasPlacePings)
        {
            throw TrustException.ProRequired();
        }

        var now = time.GetUtcNow();
        var presence = await store.GetPresenceAsync(accountId, now, cancellationToken);
        await store.UpsertPresenceAsync(
            accountId,
            presence with { GotHomeAt = now, LastActiveAt = now },
            cancellationToken);
    }

    public async Task GrantCircleAsync(Guid accountId, string source, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        await store.UpdateAccountAsync(
            you with { HasCircle = true, CircleSource = source },
            cancellationToken);
    }

    public async Task DeleteAccountAsync(Guid accountId, CancellationToken cancellationToken)
    {
        await RequireAccount(accountId, cancellationToken);
        await store.DeleteAccountAsync(accountId, cancellationToken);
    }

    public async Task RevokeAsync(Guid accountId, Guid otherId, CancellationToken cancellationToken)
    {
        if (!await store.AreConnectedAsync(accountId, otherId, cancellationToken))
        {
            throw TrustException.NotConnected();
        }

        await store.ClearActiveLookAsync(accountId, otherId, cancellationToken);
        await store.ClearActiveLookAsync(otherId, accountId, cancellationToken);
        await store.RevokeMembershipAsync(accountId, otherId, cancellationToken);
        if (await store.ActiveMembershipCountAsync(accountId, cancellationToken) == 0)
        {
            await store.ClearLocationsAsync(accountId, cancellationToken);
        }

        if (await store.ActiveMembershipCountAsync(otherId, cancellationToken) == 0)
        {
            await store.ClearLocationsAsync(otherId, cancellationToken);
        }
    }

    public async Task RenameAsync(Guid accountId, string displayName, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var trimmed = displayName.Trim();
        if (!AccountIdentity.IsChosenDisplayName(trimmed))
        {
            throw new TrustException(
                "invalid_name",
                "Enter a display name of at least two characters.");
        }

        await store.UpdateAccountAsync(you with { DisplayName = trimmed }, cancellationToken);
    }

    public HandleAvailability CheckHandle(Guid accountId, string? raw, Account? existing)
    {
        if (!AccountHandle.TryValidate(raw, out var normalized, out var errorCode))
        {
            return new HandleAvailability(normalized, false, errorCode);
        }

        if (existing is not null && existing.Id != accountId)
        {
            return new HandleAvailability(normalized, false, "handle_in_use");
        }

        return new HandleAvailability(normalized, true, null);
    }

    public async Task<HandleAvailability> CheckHandleAsync(
        Guid accountId,
        string? raw,
        CancellationToken cancellationToken)
    {
        if (!AccountHandle.TryValidate(raw, out var normalized, out var errorCode))
        {
            return new HandleAvailability(normalized, false, errorCode);
        }

        var existing = await store.FindByHandleAsync(normalized, cancellationToken);
        return CheckHandle(accountId, normalized, existing);
    }

    public async Task SetHandleAsync(Guid accountId, string? raw, CancellationToken cancellationToken)
    {
        if (!AccountHandle.TryValidate(raw, out var normalized, out var errorCode))
        {
            throw errorCode == "reserved_handle"
                ? TrustException.ReservedHandle()
                : TrustException.InvalidHandle();
        }

        var you = await RequireAccount(accountId, cancellationToken);
        var existing = await store.FindByHandleAsync(normalized, cancellationToken);
        if (existing is not null && existing.Id != accountId)
        {
            throw TrustException.HandleInUse();
        }

        var displayName = you.HasChosenDisplayName ? you.DisplayName : normalized;
        await store.SetHandleAsync(accountId, normalized, displayName, cancellationToken);
    }

    public async Task<int> LooksTodayAsync(Guid viewerId, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var start = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        return await store.LooksTodayAsync(viewerId, start, cancellationToken);
    }

    public async Task SetPresenceGrantAsync(
        Guid subjectId,
        Guid trusteeId,
        bool enabled,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(subjectId, cancellationToken);
        await RequireAccount(trusteeId, cancellationToken);
        if (!await store.AreConnectedAsync(you.Id, trusteeId, cancellationToken))
        {
            throw TrustException.NotConnected();
        }

        await store.SetPresenceGrantAsync(you.Id, trusteeId, enabled, time.GetUtcNow(), cancellationToken);
    }

    public async Task SetHomePlaceAsync(
        Guid accountId,
        Guid placeId,
        string label,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var trimmed = string.IsNullOrWhiteSpace(label) ? "Home" : label.Trim();
        if (trimmed.Length > 40)
        {
            trimmed = trimmed[..40];
        }

        var now = time.GetUtcNow();
        await store.UpsertHomePlaceAsync(new HomePlace(you.Id, placeId, trimmed, now), cancellationToken);
        var current = await store.GetCurrentHomePresenceAsync(you.Id, cancellationToken);
        if (current is null)
        {
            await store.UpsertCurrentHomePresenceAsync(
                new CurrentHomePresence(you.Id, placeId, HomePresenceState.Unknown, now, null),
                cancellationToken);
        }
    }

    public async Task PostHomePresenceAsync(
        Guid accountId,
        HomePresenceState state,
        DateTimeOffset? signaledAt,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var place = await store.GetHomePlaceAsync(you.Id, cancellationToken)
            ?? throw new TrustException("home_unset", "Set Home on this phone before posting presence.");
        var now = time.GetUtcNow();
        var at = signaledAt ?? now;
        if (at > now.AddMinutes(2))
        {
            at = now;
        }

        var previous = await store.GetCurrentHomePresenceAsync(you.Id, cancellationToken);
        var changedAt = previous is not null && previous.State == state
            ? previous.LastChangedAt
            : at;
        await store.UpsertCurrentHomePresenceAsync(
            new CurrentHomePresence(you.Id, place.PlaceId, state, changedAt, at),
            cancellationToken);

        if (state == HomePresenceState.Home)
        {
            await ResolvePromisesOnArrivalAsync(you.Id, at, cancellationToken);
        }
    }

    public async Task<HomePromise> CreatePromiseAsync(
        Guid subjectId,
        Guid trusteeId,
        DateTimeOffset deadlineAt,
        CancellationToken cancellationToken)
    {
        var you = await RequireAccount(subjectId, cancellationToken);
        await RequireAccount(trusteeId, cancellationToken);
        if (!await store.AreConnectedAsync(you.Id, trusteeId, cancellationToken))
        {
            throw TrustException.NotConnected();
        }

        var place = await store.GetHomePlaceAsync(you.Id, cancellationToken)
            ?? throw new TrustException("home_unset", "Set Home before making a promise.");
        var now = time.GetUtcNow();
        if (deadlineAt <= now)
        {
            throw new TrustException("invalid_deadline", "Choose a time in the future.");
        }

        var existing = await store.GetActivePromiseAsync(you.Id, trusteeId, cancellationToken);
        if (existing is not null)
        {
            var updated = existing with { DeadlineAt = deadlineAt, PlaceId = place.PlaceId };
            await store.UpdatePromiseAsync(updated, cancellationToken);
            return updated;
        }

        var promise = new HomePromise(
            Guid.NewGuid(),
            you.Id,
            trusteeId,
            place.PlaceId,
            deadlineAt,
            PromiseStatus.Active,
            null,
            now);
        await store.InsertPromiseAsync(promise, cancellationToken);
        return promise;
    }

    public async Task EvaluateDuePromisesAsync(CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var due = await store.ListDuePromisesAsync(now, cancellationToken);
        foreach (var promise in due)
        {
            var presence = await store.GetCurrentHomePresenceAsync(promise.SubjectId, cancellationToken);
            PromiseStatus status;
            if (presence?.State == HomePresenceState.Home
                && presence.LastChangedAt <= promise.DeadlineAt)
            {
                status = PromiseStatus.Resolved;
            }
            else if (presence?.LastSignalAt is { } signal
                     && now - signal > TrustRules.PresenceSignalStale)
            {
                status = PromiseStatus.NoSignal;
            }
            else if (presence is null
                     || presence.LastSignalAt is null
                     || now - presence.LastSignalAt > TrustRules.PresenceSignalStale)
            {
                status = PromiseStatus.NoSignal;
            }
            else
            {
                status = PromiseStatus.Overdue;
            }

            await store.UpdatePromiseAsync(
                promise with
                {
                    Status = status,
                    ResolvedAt = status == PromiseStatus.Resolved ? presence!.LastChangedAt : now
                },
                cancellationToken);
        }
    }

    public async Task EnsureReviewCircleAsync(Guid accountId, CancellationToken cancellationToken)
    {
        var you = await RequireAccount(accountId, cancellationToken);
        var connected = await store.ListConnectedAsync(accountId, cancellationToken);
        if (connected.Count > 0)
        {
            return;
        }

        var now = time.GetUtcNow();
        var alex = await SeedPersonAsync(you.Id, "alex", "Alex", now, 0.000, 0.000, 74, false, cancellationToken);
        var jordan = await SeedPersonAsync(you.Id, "jordan", "Jordan", now, 0.004, 0.003, 81, false, cancellationToken);
        var riley = await SeedPersonAsync(you.Id, "riley", "Riley", now, -0.003, 0.005, 58, true, cancellationToken);

        await store.InsertMembershipAsync(you.Id, alex.Id, cancellationToken);
        await store.InsertMembershipAsync(you.Id, jordan.Id, cancellationToken);
        await store.InsertMembershipAsync(you.Id, riley.Id, cancellationToken);

        await store.UpsertShareAsync(you.Id, alex.Id, ShareState.Default, cancellationToken);
        await store.UpsertShareAsync(alex.Id, you.Id, ShareState.Default, cancellationToken);

        await store.UpsertShareAsync(you.Id, jordan.Id, new ShareState(ShareResting.Always, null), cancellationToken);
        await store.UpsertShareAsync(jordan.Id, you.Id, new ShareState(ShareResting.Always, null), cancellationToken);

        await store.UpsertShareAsync(
            you.Id,
            riley.Id,
            new ShareState(ShareResting.UntilTheyLook, now.AddMinutes(47)),
            cancellationToken);
        await store.UpsertShareAsync(
            riley.Id,
            you.Id,
            new ShareState(ShareResting.UntilTheyLook, now.AddMinutes(47)),
            cancellationToken);
    }

    private async Task ResolvePromisesOnArrivalAsync(
        Guid subjectId,
        DateTimeOffset arrivedAt,
        CancellationToken cancellationToken)
    {
        var connected = await store.ListConnectedAsync(subjectId, cancellationToken);
        foreach (var person in connected)
        {
            var active = await store.GetActivePromiseAsync(subjectId, person.Id, cancellationToken);
            if (active is null)
            {
                continue;
            }

            await store.UpdatePromiseAsync(
                active with { Status = PromiseStatus.Resolved, ResolvedAt = arrivedAt },
                cancellationToken);
        }
    }

    private async Task<PromiseView?> BuildPromiseViewAsync(
        Guid youId,
        Guid otherId,
        CancellationToken cancellationToken)
    {
        var promises = await store.ListPromisesForPairAsync(youId, otherId, cancellationToken);
        var relevant = promises.FirstOrDefault(promise =>
            promise.Status is PromiseStatus.Active or PromiseStatus.Overdue or PromiseStatus.NoSignal
            || (promise.Status == PromiseStatus.Resolved
                && promise.ResolvedAt is { } resolved
                && time.GetUtcNow() - resolved < TimeSpan.FromHours(12)));
        if (relevant is null)
        {
            return null;
        }

        var subjectPlace = await store.GetHomePlaceAsync(relevant.SubjectId, cancellationToken);
        return new PromiseView(
            relevant.Id,
            relevant.SubjectId,
            relevant.TrusteeId,
            subjectPlace?.Label ?? "Home",
            relevant.DeadlineAt,
            relevant.Status,
            relevant.ResolvedAt,
            relevant.SubjectId == youId);
    }

    private async Task<ActiveLook?> RequireLiveActiveLookAsync(
        Guid viewerId,
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var active = await store.GetActiveLookAsync(viewerId, subjectId, cancellationToken);
        if (active is null)
        {
            return null;
        }

        if (ActiveLookRules.IsExpired(active, time.GetUtcNow()))
        {
            await store.ClearActiveLookAsync(viewerId, subjectId, cancellationToken);
            return null;
        }

        return active;
    }

    private async Task<ActiveLook?> RequireLiveLookAtMeAsync(
        Guid subjectId,
        CancellationToken cancellationToken)
    {
        var watched = await store.GetLookAtMeAsync(subjectId, cancellationToken);
        if (watched is null)
        {
            return null;
        }

        if (ActiveLookRules.IsExpired(watched, time.GetUtcNow()))
        {
            await store.ClearActiveLookAsync(watched.ViewerId, watched.SubjectId, cancellationToken);
            return null;
        }

        return watched;
    }

    private async Task<Account> SeedPersonAsync(
        Guid ownerId,
        string slug,
        string name,
        DateTimeOffset now,
        double latOff,
        double lonOff,
        int battery,
        bool charging,
        CancellationToken cancellationToken)
    {
        var subject = $"{ownerId:N}:{slug}";
        var existing = await store.FindByProviderAsync("seed", subject, cancellationToken);
        var origin = new LocationFix(
            now,
            LocationTrail.Home.Latitude + latOff,
            LocationTrail.Home.Longitude + lonOff);
        if (existing is null)
        {
            existing = await store.UpsertAccountAsync(
                new Account(Guid.NewGuid(), "seed", subject, name, false, null, now),
                cancellationToken);
        }

        await store.UpsertPresenceAsync(
            existing.Id,
            new Presence(now.AddMinutes(-12), battery, charging, now.AddMinutes(-40), null),
            cancellationToken);
        foreach (var point in LocationTrail.Seed(origin, now, 24, 15, 0.0004))
        {
            await store.IngestLocationAsync(existing.Id, point, cancellationToken);
        }

        return existing;
    }

    private async Task<LookSession?> BuildSessionAsync(
        Account viewer,
        Account subject,
        ActiveLook active,
        CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var trail = await store.UnlockLocationsAsync(
            subject.Id,
            now.AddHours(-Math.Max(active.HistoryWindowHours, TrustRules.FreeHistoryHours)),
            now,
            cancellationToken);
        var live = trail.LastOrDefault() ?? await store.LatestLocationAsync(subject.Id, cancellationToken);
        if (live is null)
        {
            return null;
        }

        var look = new LookEvent(
            active.LookId,
            viewer.Id,
            viewer.DisplayName,
            subject.Id,
            subject.DisplayName,
            active.OpenedAt,
            active.HistoryWindowHours,
            true);
        return new LookSession(look, live, trail.Count > 0 ? trail : [live]);
    }

    private static CircleCoverage CoverageOf(Account you, IReadOnlyList<Account> connected)
    {
        Account? sponsor = you.HasCircle ? you : connected.FirstOrDefault(person => person.HasCircle);
        return new CircleCoverage(
            sponsor is not null,
            sponsor?.DisplayName,
            sponsor?.Id == you.Id);
    }

    private async Task EnsureSeatAsync(Account a, Account b, CancellationToken cancellationToken)
    {
        var connectedA = await store.ListConnectedAsync(a.Id, cancellationToken);
        var connectedB = await store.ListConnectedAsync(b.Id, cancellationToken);
        var covered = a.HasCircle || b.HasCircle
            || connectedA.Any(person => person.HasCircle)
            || connectedB.Any(person => person.HasCircle);
        var limit = covered ? TrustRules.ProSeats : TrustRules.FreeSeats;
        var countA = await store.ActiveMembershipCountAsync(a.Id, cancellationToken);
        var countB = await store.ActiveMembershipCountAsync(b.Id, cancellationToken);
        if (countA >= limit || countB >= limit)
        {
            throw TrustException.SeatLimit();
        }
    }

    private async Task<Account> RequireAccount(Guid id, CancellationToken cancellationToken) =>
        await store.FindAccountAsync(id, cancellationToken)
        ?? throw TrustException.Unauthorized();

    private static string MakeInviteCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Span<char> chars = stackalloc char[6];
        for (var i = 0; i < chars.Length; i++)
        {
            chars[i] = alphabet[Random.Shared.Next(alphabet.Length)];
        }

        return new string(chars);
    }
}

public static class LocationTrail
{
    public static LocationFix Home { get; } = new(
        DateTimeOffset.UnixEpoch,
        37.7599,
        -122.4148);

    public static IReadOnlyList<LocationFix> Seed(
        LocationFix origin,
        DateTimeOffset now,
        double hours,
        double intervalMinutes,
        double drift)
    {
        var totalMinutes = hours * 60;
        var steps = (int)(totalMinutes / intervalMinutes);
        var points = new List<LocationFix>(steps + 1);
        for (var index = 0; index <= steps; index++)
        {
            var minutesAgo = totalMinutes - index * intervalMinutes;
            var progress = steps == 0 ? 1 : (double)index / steps;
            var lat = origin.Latitude
                + 0.004 * Math.Sin(progress * Math.PI * 2)
                + 0.0015 * progress
                + drift;
            var lon = origin.Longitude
                + 0.005 * (Math.Cos(progress * Math.PI * 2) - 1)
                - 0.0008 * progress
                + drift * 0.6;
            points.Add(new LocationFix(now.AddMinutes(-minutesAgo), lat, lon));
        }

        return points;
    }

    public static bool IsNearHome(LocationFix point, LocationFix? home = null)
    {
        home ??= Home;
        var dlat = point.Latitude - home.Latitude;
        var dlon = point.Longitude - home.Longitude;
        var meters = Math.Sqrt(dlat * dlat + dlon * dlon) * 111_000;
        return meters < 120;
    }
}
