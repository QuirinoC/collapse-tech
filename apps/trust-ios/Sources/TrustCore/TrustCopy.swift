import Foundation

/// Product copy. Voice (design SoT `design-mocks/duo-gpt6`): short nouns and verbs,
/// consequence before action, no apology copy, no lifestyle poetry.
/// English is the development language; 1.0 ships English only.
public enum TrustCopy {
    /// Product name. Do not translate.
    public static let appName = "Trust Circle"
    /// Wordmark. Rendered as "Trust" + red dot. Do not translate.
    public static let mastheadName = "Trust"

    static func value(_ key: String, defaultValue: String) -> String {
        NSLocalizedString(key, tableName: "Localizable", bundle: .main, value: defaultValue, comment: "")
    }

    private static func format(_ key: String, defaultValue: String, _ arguments: CVarArg...) -> String {
        String(format: value(key, defaultValue: defaultValue), locale: .current, arguments: arguments)
    }

    // MARK: Shell

    public static var circle: String { value("circle", defaultValue: "Circle") }
    public static var sharing: String { value("sharing", defaultValue: "Sharing") }
    public static var inviteTab: String { value("invite_tab", defaultValue: "Invite") }
    public static var you: String { value("you", defaultValue: "You") }
    public static var map: String { value("map", defaultValue: "Map") }
    public static var viewLog: String { value("view_log", defaultValue: "View log") }

    public static var cancel: String { value("cancel", defaultValue: "Cancel") }
    public static var close: String { value("close", defaultValue: "Close") }
    public static var done: String { value("done", defaultValue: "Done") }
    public static var back: String { value("back", defaultValue: "Back") }
    public static var later: String { value("later", defaultValue: "Later") }
    public static var continueAction: String { value("continue", defaultValue: "Continue") }
    public static var look: String { value("look", defaultValue: "Look") }
    public static var view: String { value("view", defaultValue: "View") }
    public static var stop: String { value("stop", defaultValue: "Stop") }
    public static var join: String { value("join", defaultValue: "Join") }
    public static var them: String { value("them", defaultValue: "them") }
    public static var someone: String { value("someone", defaultValue: "Someone") }
    public static var now: String { value("now", defaultValue: "now") }
    public static var retry: String { value("retry", defaultValue: "Retry") }

    // MARK: Login (A1)

    public static var loginPromise: String {
        value("login_promise", defaultValue: "Sealed until Look — or Available when you choose.")
    }
    public static var signInWithApple: String { value("sign_in_with_apple", defaultValue: "Sign in with Apple") }
    public static var signingIn: String { value("signing_in", defaultValue: "Signing in…") }
    public static var signingInShort: String { value("signing_in_short", defaultValue: "Signing in") }
    public static var seeTheApp: String { value("see_the_app", defaultValue: "See the app") }
    public static var trustUsesSignInWithApple: String {
        value("trust_uses_sign_in_with_apple", defaultValue: "Trust uses Sign in with Apple.")
    }
    public static var termsOfService: String { value("terms_of_service", defaultValue: "Terms of Service") }
    public static var terms: String { value("terms", defaultValue: "Terms") }
    public static var privacy: String { value("privacy", defaultValue: "Privacy") }
    public static var support: String { value("support", defaultValue: "Support") }
    public static var demoBannerTitle: String { value("demo_banner_title", defaultValue: "Demo") }
    public static var demoBannerBody: String {
        value("demo_banner_body", defaultValue: "Nine fictional people. Offline — no Sign in with Apple, nothing is sent.")
    }
    public static var demoSimulated: String {
        value("demo_simulated", defaultValue: "Demo — notification is simulated.")
    }

    // MARK: Handle (A2)

    public static var yourHandle: String { value("your_handle", defaultValue: "Your handle") }
    public static var handleIntro: String {
        value("handle_intro", defaultValue: "Pick a handle. That’s you on Trust. Location stays sealed until someone Looks.")
    }
    public static var handle: String { value("handle", defaultValue: "Handle") }
    public static var handleRules: String {
        value("handle_rules", defaultValue: "3–20 characters. Letters, numbers, underscores. Starts with a letter.")
    }
    public static var handleAvailable: String { value("handle_available", defaultValue: "Available") }
    public static var handleTaken: String { value("handle_taken", defaultValue: "Taken") }
    public static var handleReserved: String { value("handle_reserved", defaultValue: "Reserved") }
    public static var handleInvalid: String { value("handle_invalid", defaultValue: "That handle isn’t valid.") }
    public static var enterHandle: String { value("enter_handle", defaultValue: "Enter a handle to continue.") }
    public static var yourPhone: String { value("your_phone", defaultValue: "Your phone") }
    public static var phoneIntro: String {
        value("phone_intro", defaultValue: "A code is texted to this number.")
    }
    public static var phoneNumber: String { value("phone_number", defaultValue: "Phone number") }
    public static var phoneConsent: String {
        value(
            "phone_consent",
            defaultValue: "Text me a Trust verification code. Up to 8 texts a day. Message and data rates may apply. Reply HELP for help or STOP to opt out."
        )
    }
    public static var sendCode: String { value("send_code", defaultValue: "Send code") }
    public static var verificationCode: String { value("verification_code", defaultValue: "Code") }
    public static var verifyCode: String { value("verify_code", defaultValue: "Verify") }

    // MARK: Modes & presence (shared vocabulary)

    public static var off: String { value("off", defaultValue: "Off") }
    public static var notSharing: String { value("not_sharing", defaultValue: "Not sharing") }
    public static var untilTheyLook: String { value("until_they_look", defaultValue: "Until they look") }
    public static var always: String { value("always", defaultValue: "Always") }
    public static var forAWhile: String { value("for_a_while", defaultValue: "For a while") }
    public static var pause: String { value("pause", defaultValue: "Pause") }
    public static var paused: String { value("paused", defaultValue: "Paused") }
    public static var resume: String { value("resume", defaultValue: "Resume") }
    public static var remove: String { value("remove", defaultValue: "Remove") }
    public static var sealed: String { value("sealed", defaultValue: "Sealed") }
    public static var available: String { value("available", defaultValue: "Available") }
    public static var presenceHome: String { value("presence_home", defaultValue: "Home") }
    public static var presenceAway: String { value("presence_away", defaultValue: "Away") }
    public static var presenceHidden: String { value("presence_hidden", defaultValue: "Hidden") }
    public static var presenceUnknown: String { value("presence_unknown", defaultValue: "No signal") }
    public static var presenceHiddenBadge: String { value("presence_hidden_badge", defaultValue: "Presence hidden") }

    public static var timed15m: String { value("timed_15m", defaultValue: "15 minutes") }
    public static var timed1h: String { value("timed_1h", defaultValue: "1 hour") }
    public static var timed4h: String { value("timed_4h", defaultValue: "4 hours") }
    public static var timed8h: String { value("timed_8h", defaultValue: "8 hours") }

    // MARK: Circle (T1)

    public static var sharedWithYou: String { value("shared_with_you", defaultValue: "Shared with you") }
    public static var notSharingWithYou: String { value("not_sharing_with_you", defaultValue: "Not sharing with you") }
    public static var rowSealedPresenceHidden: String {
        value("row_sealed_presence_hidden", defaultValue: "Sealed · presence hidden")
    }
    public static var rowAvailablePresenceHidden: String {
        value("row_available_presence_hidden", defaultValue: "Available · presence hidden")
    }
    public static func rowSealed(presence: String) -> String {
        format("row_sealed", defaultValue: "%@ · Sealed", presence)
    }
    public static func rowAvailable(presence: String) -> String {
        format("row_available", defaultValue: "%@ · Available", presence)
    }
    public static var rowLookedTapView: String { value("row_looked_tap_view", defaultValue: "Looked · tap View") }
    public static var rowNotSharingWithYou: String {
        value("row_not_sharing_with_you", defaultValue: "Not sharing with you. They can set a mode in Sharing.")
    }
    public static var circleFootnote: String {
        value(
            "circle_footnote",
            defaultValue: "Sealed needs Look (they’re notified). Available is Always or For a while — views are still logged. Add people from Invite."
        )
    }
    public static var circleEmptyTitle: String { value("circle_empty_title", defaultValue: "Nobody shares with you yet.") }
    public static var circleEmptyBody: String {
        value("circle_empty_body", defaultValue: "Invite someone. They choose what to share.")
    }
    public static var inviteSomeone: String { value("invite_someone", defaultValue: "Invite someone") }
    public static func lookHint(name: String) -> String {
        format("look_hint", defaultValue: "Look at %@. They will be notified.", name)
    }
    public static func viewHint(name: String) -> String {
        format("view_hint", defaultValue: "View %@. The view is logged.", name)
    }

    // MARK: Look confirm (notify first)

    public static var confirm: String { value("confirm", defaultValue: "Confirm") }
    public static func lookAtTitle(name: String) -> String { format("look_at_title", defaultValue: "Look at %@?", name) }
    public static func lookAt(name: String) -> String { format("look_at", defaultValue: "Look at %@", name) }
    public static func willBeNotified(name: String) -> String {
        format("will_be_notified", defaultValue: "%@ will be notified.", name)
    }
    public static var thenOneSnapshot: String {
        value("then_one_snapshot", defaultValue: "Then you’ll see one location snapshot — not a live feed.")
    }
    public static func previewLine(viewer: String) -> String {
        format("preview_line", defaultValue: "%@ looked at your location.", viewer)
    }
    public static var receiptNoteSealed: String {
        value("receipt_note_sealed", defaultValue: "One snapshot. Their share stays sealed after this. Every Look is recorded.")
    }
    public static func lookNotify(name: String) -> String { format("look_notify", defaultValue: "Look · notify %@", name) }

    // MARK: View (D1)

    public static var oneTimeLook: String { value("one_time_look", defaultValue: "One-time Look") }
    public static var liveShare: String { value("live_share", defaultValue: "Location available · live share") }
    public static func receiptNotified(name: String) -> String {
        format("receipt_notified", defaultValue: "%@ notified · receipt saved", name)
    }
    public static func receiptViewLogged(name: String) -> String {
        format("receipt_view_logged", defaultValue: "%@ · view logged", name)
    }
    public static var stripSnapshot: String {
        value("strip_snapshot", defaultValue: "Snapshot only. Their Until-they-look share is used. No further updates.")
    }
    public static var stripLive: String {
        value("strip_live", defaultValue: "Location is available while their share is on. Every view is logged.")
    }
    public static var stripTrail: String {
        value("strip_trail", defaultValue: "Open Look trail from retained points. Not a driving log.")
    }
    public static func seeTrail(hours: Int) -> String {
        if hours >= 24 {
            let days = hours / 24
            return format("see_trail_days", defaultValue: "See last %d days", days)
        }
        return format("see_trail_hours", defaultValue: "See last %d hours", hours)
    }
    public static var circleMap: String { value("circle_map", defaultValue: "Circle map") }
    public static func snapshotAt(_ time: String) -> String { format("snapshot_at", defaultValue: "Snapshot · %@", time) }
    public static func updatedAt(_ time: String) -> String { format("updated_at", defaultValue: "Updated %@", time) }
    public static func distanceFromYou(_ distance: String) -> String {
        format("distance_from_you", defaultValue: "%@ from you", distance)
    }
    public static var location: String { value("location", defaultValue: "Location") }
    public static var sealedTitle: String { value("sealed_title", defaultValue: "Sealed") }
    public static func sealedBody(name: String) -> String {
        format("sealed_body", defaultValue: "%@ will be notified if you Look.", name)
    }
    public static var noLocationYet: String { value("no_location_yet", defaultValue: "No location yet.") }
    public static var noLocationBody: String {
        value("no_location_body", defaultValue: "They haven’t sent a location yet. Try again in a moment.")
    }

    // MARK: Map (D2)

    public static var noLocationsYet: String { value("no_locations_yet", defaultValue: "No locations yet") }
    public static var mapEmptyBody: String {
        value(
            "map_empty_body",
            defaultValue: "Sealed people don’t appear here. Look (they’re notified), or wait until someone shares Always / For a while."
        )
    }
    public static var backToCircle: String { value("back_to_circle", defaultValue: "Back to Circle") }
    public static func onMap(count: Int, sealed: Int) -> String {
        format("on_map", defaultValue: "%d on map · %d sealed", count, sealed)
    }
    public static var mapLegend: String { value("map_legend", defaultValue: "Available + opened") }
    public static var oneLook: String { value("one_look", defaultValue: "One look") }
    public static var snapshot: String { value("snapshot", defaultValue: "Snapshot") }
    public static func sealedNotOnMap(_ count: Int) -> String {
        if count == 1 {
            return value("sealed_not_on_map_one", defaultValue: "1 sealed location not on this map.")
        }
        return format("sealed_not_on_map", defaultValue: "%d sealed locations not on this map.", count)
    }
    public static func viewLocation(name: String) -> String {
        format("view_location", defaultValue: "View %@’s location", name)
    }
    public static var mapAccessibility: String {
        value("map_accessibility", defaultValue: "Map. Available people and opened snapshots are pins. Sealed people are not on the map.")
    }
    public static var onTheMap: String { value("on_the_map", defaultValue: "On the map") }
    public static func pinAccessibility(name: String, live: Bool) -> String {
        format("pin_accessibility", defaultValue: "%@. %@.", name, live ? available : snapshot)
    }
    public static func showOnMap(name: String) -> String {
        format("show_on_map", defaultValue: "Show %@ on the map", name)
    }

    // MARK: Sharing (T2)

    public static var sharingSub: String { value("sharing_sub", defaultValue: "What each person can see of you.") }
    public static var sharingIntro: String {
        value(
            "sharing_intro",
            defaultValue: "Sealed until Look, or Available with Always / For a while. Views and Looks are always logged."
        )
    }
    public static func youShareWith(count: Int) -> String {
        format("you_share_with", defaultValue: "You share with · %d", count)
    }
    public static var rowSealedUntilLook: String { value("row_sealed_until_look", defaultValue: "Sealed until Look") }
    public static var rowLocationAvailable: String { value("row_location_available", defaultValue: "Location available") }
    public static var descOff: String { value("desc_off", defaultValue: "Not sharing. They can’t Look at you.") }
    public static var descPause: String {
        value("desc_pause", defaultValue: "Paused — temporarily not sharing. They stay in your list.")
    }
    public static var descUntil: String { value("desc_until", defaultValue: "Sealed until they Look. You’re notified.") }
    public static var descAlways: String {
        value("desc_always", defaultValue: "Location available to them. Every view is logged.")
    }
    public static func descTimed(until: String) -> String {
        format("desc_timed", defaultValue: "Available until %@. Then seals. Views are logged.", until)
    }
    public static var plus: String { value("plus", defaultValue: "Plus") }
    public static var plusLockHint: String { value("plus_lock_hint", defaultValue: "Always and For a while are Plus.") }
    public static var modeKey: String {
        value(
            "mode_key",
            defaultValue: "Until they look — sealed; one Look, you’re notified.\nAlways — location available until you stop; every view logged.\nFor a while — available on a timer, then seals.\nPause — temporarily not sharing; they stay in your list.\nStop — off. Remove drops the pair."
        )
    }
    public static func pauseConfirm(name: String) -> String {
        format("pause_confirm", defaultValue: "Pause sharing with %@? They stay in your list.", name)
    }
    public static func removeConfirm(name: String) -> String {
        format("remove_confirm", defaultValue: "Remove %@ from Trust? You both lose this pair.", name)
    }
    public static func sharingPaused(name: String) -> String {
        format("sharing_paused", defaultValue: "Paused with %@. Not sharing for now.", name)
    }
    public static func personRemoved(name: String) -> String {
        format("person_removed", defaultValue: "%@ removed from Trust.", name)
    }
    public static var howLong: String { value("how_long", defaultValue: "How long") }
    public static func forAWhileWith(name: String) -> String {
        format("for_a_while_with", defaultValue: "Available to %@ on a timer. Then seals. Views are logged.", name)
    }
    public static var shareForAWhile: String { value("share_for_a_while", defaultValue: "Share for a while") }
    public static var sharingEmptyTitle: String { value("sharing_empty_title", defaultValue: "No one to share with yet.") }
    public static var sharingEmptyBody: String {
        value("sharing_empty_body", defaultValue: "Invite someone first. Sharing stays off until you choose a mode.")
    }
    public static func modeUpdated(name: String, mode: String) -> String {
        format("mode_updated", defaultValue: "%@: %@. Permission updated.", name, mode)
    }
    public static func sharingStopped(name: String) -> String {
        format("sharing_stopped", defaultValue: "Location sharing with %@ stopped.", name)
    }
    public static var timerEnded: String {
        value("timer_ended", defaultValue: "A timed share ended. Your location is sealed again.")
    }
    public static func stopConfirm(name: String) -> String {
        format("stop_confirm", defaultValue: "Stop sharing with %@? They can’t Look at you until you choose a mode again.", name)
    }

    // MARK: Always location explainer

    public static var alwaysTitle: String { value("always_title", defaultValue: "Your location is in the product now.") }
    public static var alwaysBody: String {
        value(
            "always_body",
            defaultValue: "Allow Always so a Look still works when Trust Circle is closed. Sealed stays sealed — nobody sees coordinates until they Look, and you’re notified."
        )
    }
    public static var allowAlways: String { value("allow_always", defaultValue: "Allow Always") }
    public static var openSettings: String { value("open_settings", defaultValue: "Open Settings") }
    public static var alwaysNeededForSharing: String {
        value("always_needed_for_sharing", defaultValue: "Sharing needs Always so a Look still works when Trust Circle is closed.")
    }
    public static var keptWhileUsing: String {
        value(
            "kept_while_using",
            defaultValue: "You kept While Using. Your location only updates while Trust Circle is open. Change to Always in iOS Settings."
        )
    }
    public static var locationDeniedBody: String {
        value(
            "location_denied_body",
            defaultValue: "Location is off. You can still see people who share with you and Look. Your location is not in the product until you allow it."
        )
    }
    public static var locationReducedAccuracy: String {
        value("location_reduced_accuracy", defaultValue: "Approximate location is on. Sharing needs precise location.")
    }
    public static var allowPreciseLocation: String { value("allow_precise_location", defaultValue: "Allow precise location") }
    public static var openIOSSettings: String { value("open_ios_settings", defaultValue: "Open iOS Settings") }
    public static var whileUsing: String { value("while_using", defaultValue: "While using") }
    public static var denied: String { value("denied", defaultValue: "Denied") }
    public static var notAsked: String { value("not_asked", defaultValue: "Not asked") }
    public static var unknown: String { value("unknown", defaultValue: "Unknown") }
    public static var precise: String { value("precise", defaultValue: "Precise") }
    public static var approximate: String { value("approximate", defaultValue: "Approximate") }

    // MARK: Invite (T3)

    public static var inviteSub: String { value("invite_sub", defaultValue: "Add someone to your circle.") }
    public static var inviteLine: String { value("invite_line", defaultValue: "I trust you with my location.") }
    public static var inviteDescription: String {
        value("invite_description", defaultValue: "They join the circle. Sharing stays off until each of you chooses a mode.")
    }
    public static var yourCode: String { value("your_code", defaultValue: "Your code") }
    public static var createInvite: String { value("create_invite", defaultValue: "Create invite") }
    public static var shareInviteLink: String { value("share_invite_link", defaultValue: "Share invite link") }
    public static var enterACode: String { value("enter_a_code", defaultValue: "Enter a code") }
    public static var codePlaceholder: String { value("code_placeholder", defaultValue: "ABC123") }
    public static var inviteFootnote: String {
        value("invite_footnote", defaultValue: "Invite ≠ permission. Modes are set after they join.")
    }
    public static var inviteReady: String { value("invite_ready", defaultValue: "Invite ready") }
    public static var inviteReadyBody: String {
        value("invite_ready_body", defaultValue: "Send the link. Nothing is shared until each of you chooses a mode.")
    }
    public static var joined: String { value("joined", defaultValue: "You joined the circle. Sharing is off both ways.") }
    public static func inviteMessage(code: String) -> String {
        "\(inviteLine)\nhttps://trust.collapsetechnologies.com/i/\(code)\ntrust://invite/\(code)"
    }
    public static func seatsUsed(count: Int, limit: Int) -> String {
        format("seats_used", defaultValue: "%d of %d people", count, limit)
    }

    // MARK: You (T4)

    public static var freePlan: String { value("free_plan", defaultValue: "Free plan") }
    public static var plusPlan: String { value("plus_plan", defaultValue: "Plus") }
    public static var status: String { value("status", defaultValue: "Status") }
    public static var sealedByDefault: String { value("sealed_by_default", defaultValue: "Sealed by default") }
    public static func statusSharing(count: Int) -> String {
        if count == 1 {
            return value(
                "status_sharing_one",
                defaultValue: "Sharing with 1 person.\nLooks notify you. Available shares still log every view."
            )
        }
        return format(
            "status_sharing",
            defaultValue: "Sharing with %d people.\nLooks notify you. Available shares still log every view.",
            count
        )
    }
    public static var statusNone: String {
        value("status_none", defaultValue: "No outbound location shares.\nNobody can Look at you.")
    }
    public static var manageSharing: String { value("manage_sharing", defaultValue: "Manage sharing") }
    public static var presence: String { value("presence", defaultValue: "Presence") }
    public static var presenceNote: String {
        value("presence_note", defaultValue: "Home / Away / Hidden — separate from whether location is sealed or available.")
    }
    public static var homePlace: String { value("home_place", defaultValue: "Home place") }
    public static var homePlaceNote: String {
        value(
            "home_place_note",
            defaultValue: "Set from where you are now. Coordinates stay on this phone. With Always location, Trust marks Home or Away for your circle."
        )
    }
    public static var setHomeHere: String { value("set_home_here", defaultValue: "Use current location as Home") }
    public static var clearHome: String { value("clear_home", defaultValue: "Clear Home") }
    public static var homeSetToast: String {
        value("home_set_toast", defaultValue: "Home set on this phone. Presence can follow the boundary.")
    }
    public static var homeClearedToast: String {
        value("home_cleared_toast", defaultValue: "Home cleared. Presence stays manual.")
    }
    public static var homeNeedsLocation: String {
        value("home_needs_location", defaultValue: "Allow location, then set Home from where you are.")
    }
    public static var homeNeedsAlways: String {
        value("home_needs_always", defaultValue: "Allow Always location so Home and Away update when Trust is closed.")
    }
    public static var homeIsSetLabel: String {
        value("home_is_set_label", defaultValue: "Home is set on this phone.")
    }
    public static var homeNotSetLabel: String {
        value("home_not_set_label", defaultValue: "No Home place yet.")
    }
    public static var presenceHomeCopy: String {
        value("presence_home_copy", defaultValue: "Your circle can see Home or Away — never coordinates.")
    }
    public static var presenceAwayCopy: String {
        value("presence_away_copy", defaultValue: "Shown as Away when you’re not at Home.")
    }
    public static var presenceHiddenCopy: String {
        value("presence_hidden_copy", defaultValue: "Your circle sees no presence signal.")
    }
    public static var presenceUnknownCopy: String {
        value("presence_unknown_copy", defaultValue: "Pick one. What your circle sees before anyone Looks.")
    }
    public static var presenceHiddenToast: String {
        value("presence_hidden_toast", defaultValue: "Presence hidden from your circle.")
    }
    /// VoiceOver hint on the presence control.
    public static var presenceHint: String {
        value("presence_hint", defaultValue: "Sets what your circle sees. Never coordinates.")
    }
    /// VoiceOver label on a Sharing row's mode control.
    public static func sharingModeLabel(name: String) -> String {
        format("sharing_mode_label", defaultValue: "What %@ can see of you", name)
    }
    public static var selected: String { value("selected", defaultValue: "Selected") }
    public static func presenceSetToast(label: String) -> String {
        format("presence_set_toast", defaultValue: "Presence set to %@. No coordinates shared.", label)
    }
    public static var trustPlus: String { value("trust_plus", defaultValue: "Trust Plus") }
    public static var plusHeadline: String { value("plus_headline", defaultValue: "More room. Same rules.") }
    public static var plusFreeLine: String {
        value("plus_free_line", defaultValue: "up to 5 people · Until they look · Look + notify · single map after Look")
    }
    public static var plusPlusLine: String {
        value("plus_plus_line", defaultValue: "up to 20 · Always & For a while (location available) · circle map · full view log")
    }
    public static func plusNote(monthly: String, annual: String) -> String {
        format(
            "plus_note",
            defaultValue: "Privacy basics stay free. Plus is capacity and convenience — %@/mo or %@/yr.",
            monthly,
            annual
        )
    }
    public static var seePlus: String { value("see_plus", defaultValue: "See Plus") }
    public static var youHavePlus: String { value("you_have_plus", defaultValue: "You have Plus.") }
    public static var settings: String { value("settings", defaultValue: "Settings") }
    public static var lookNotifications: String { value("look_notifications", defaultValue: "Look notifications") }
    public static var lookNotificationsBody: String {
        value("look_notifications_body", defaultValue: "Always on for Sealed Looks. Available views are logged.")
    }
    public static var allowNotifications: String { value("allow_notifications", defaultValue: "Allow notifications") }
    public static var notificationsOff: String {
        value("notifications_off", defaultValue: "Notifications are off in iOS Settings. Look receipts still land in the view log.")
    }
    public static var stopAll: String { value("stop_all", defaultValue: "Stop all location sharing") }
    public static var stopAllConfirm: String {
        value(
            "stop_all_confirm",
            defaultValue: "Stop sharing with everyone? Your location leaves the product. Nobody can Look at you until you choose a mode again."
        )
    }
    public static var stopAllToast: String {
        value("stop_all_toast", defaultValue: "All outbound location sharing stopped.")
    }
    public static var signOut: String { value("sign_out", defaultValue: "Sign out") }
    public static var deleteAccount: String { value("delete_account", defaultValue: "Delete account") }
    public static var deleteAccountConfirm: String {
        value(
            "delete_account_confirm",
            defaultValue: "Delete your Trust Circle account? Location, views, and circle membership are removed. This cannot be undone."
        )
    }
    public static var weDoNotSellLocation: String {
        value("we_do_not_sell_location", defaultValue: "No ads. We do not sell location.")
    }
    public static var signoff: String { loginPromise }
    public static var signedOutSummary: String { value("signed_out_summary", defaultValue: "Not signed in.") }

    // MARK: View log (D3)

    public static var viewLogIntro: String {
        value("view_log_intro", defaultValue: "Both directions. Looks, views, and removals — not a GPS trail.")
    }
    public static func viewLogRetention(freeDays: Int) -> String {
        format("view_log_retention", defaultValue: "Free keeps %d days. Plus keeps a year and can export.", freeDays)
    }
    public static var noViewsYet: String { value("no_views_yet", defaultValue: "No views yet.") }
    public static var allViews: String { value("all_views", defaultValue: "All views") }
    public static func olderEntriesHeld(_ count: Int) -> String {
        format("older_entries_held", defaultValue: "%d older entries held for Plus retention.", count)
    }
    public static var exportLog: String { value("export_log", defaultValue: "Export log") }
    public static func logYouLooked(name: String) -> String { format("log_you_looked", defaultValue: "You looked at %@.", name) }
    public static func logTheyLooked(name: String) -> String { format("log_they_looked", defaultValue: "%@ looked at you.", name) }
    public static func logYouViewed(name: String) -> String { format("log_you_viewed", defaultValue: "You viewed %@.", name) }
    public static func logTheyViewed(name: String) -> String { format("log_they_viewed", defaultValue: "%@ viewed you.", name) }
    public static func logYouRemoved(name: String) -> String {
        format("log_you_removed", defaultValue: "You removed %@.", name)
    }
    public static func logTheyRemoved(name: String) -> String {
        format("log_they_removed", defaultValue: "%@ removed you.", name)
    }
    public static var kindLook: String { value("kind_look", defaultValue: "Look · notified") }
    public static var kindView: String { value("kind_view", defaultValue: "view logged") }
    public static var kindRemoved: String { value("kind_removed", defaultValue: "removed") }
    public static func lookLogExportRow(timestamp: String, line: String, kind: String) -> String {
        "\(timestamp)\t\(line)\t\(kind)"
    }

    // MARK: Receipts & toasts

    public static func receiptTitle(viewer: String) -> String {
        format("receipt_title", defaultValue: "%@ looked at your location.", viewer)
    }
    public static var receiptBody: String {
        value("receipt_body", defaultValue: "One snapshot. This is your receipt.")
    }
    public static func lookSaved(name: String) -> String {
        format("look_saved", defaultValue: "%@ notified. Look receipt saved.", name)
    }
    public static func viewLogged(name: String) -> String {
        format("view_logged", defaultValue: "%@ · view logged. Location available while they share.", name)
    }
    public static var notification: String { value("notification", defaultValue: "Notification") }
    public static var offline: String { value("offline", defaultValue: "Offline") }
    public static func offlineBanner(since: String) -> String {
        format("offline_banner", defaultValue: "Offline · circle from %@", since)
    }
    public static var offlineAction: String {
        value("offline_action", defaultValue: "You’re offline. Try again when you’re connected.")
    }

    // MARK: Plus (paywall — `SubscriptionStoreView` shows title, period, price, trial; this is the rest)

    public static func monthlyPrice(_ price: String) -> String { format("monthly_price", defaultValue: "Monthly — %@", price) }
    public static func annualPrice(_ price: String) -> String { format("annual_price", defaultValue: "Annual — %@", price) }
    public static func priceFallback(monthly: String, annual: String) -> String {
        format("price_fallback", defaultValue: "%@/mo or %@/yr. 7-day trial.", monthly, annual)
    }
    public static var trialNote: String { value("trial_note", defaultValue: "7-day trial on both plans.") }
    public static var plusFeatureSeats: String { value("plus_feature_seats", defaultValue: "Up to 20 people in your circle.") }
    public static var plusFeatureModes: String {
        value("plus_feature_modes", defaultValue: "Always and For a while — location available to the people you pick. Every view is logged.")
    }
    public static var plusFeatureMap: String { value("plus_feature_map", defaultValue: "Circle map of everyone Available.") }
    public static var plusFeatureLog: String { value("plus_feature_log", defaultValue: "View log for a year, with export.") }
    public static var plusStaysFree: String {
        value(
            "plus_stays_free",
            defaultValue: "Look, receipts, Home / Away / Hidden, Stop, Invite and Delete stay free. Plus is capacity and convenience."
        )
    }
    public static var plusCoveredBody: String {
        value("plus_covered_body", defaultValue: "Always, For a while, 20 seats, the circle map and a year of view log are on.")
    }
    public static func plusActivePlan(name: String, price: String) -> String {
        format("plus_active_plan", defaultValue: "%@ · %@", name, price)
    }
    public static var subscriptionUnavailable: String {
        value("subscription_unavailable", defaultValue: "Plus isn’t available from the App Store right now. Try again later.")
    }
    public static var restorePurchases: String { value("restore_purchases", defaultValue: "Restore purchases") }
    public static var manageSubscription: String { value("manage_subscription", defaultValue: "Manage subscription") }
    public static var unlockPlusForReview: String { value("unlock_plus_for_review", defaultValue: "Unlock Plus for review") }
    public static var plusLegal: String {
        value(
            "plus_legal",
            defaultValue: "Plus is an auto-renewing subscription. Payment is charged to your Apple Account at confirmation. It renews unless you cancel at least 24 hours before the period ends. Family Sharing is off. We do not sell location."
        )
    }
    public static var subscriptionLinked: String {
        value(
            "subscription_linked",
            defaultValue: "This Apple subscription is linked to another Trust Circle account. Contact hello@collapsetechnologies.com."
        )
    }
    public static var bannerYouPay: String { value("banner_you_pay", defaultValue: "You cover this circle") }
    public static func bannerSponsorCovers(name: String) -> String {
        format("banner_sponsor_covers", defaultValue: "%@’s Plus covers you", name)
    }
    public static var storeKitVerificationFailed: String {
        value("storekit_verification_failed", defaultValue: "StoreKit verification failed.")
    }

    // MARK: Location purpose strings (Info.plist mirrors)

    public static var locationWhenInUsePurpose: String {
        value(
            "location_when_in_use",
            defaultValue: "Trust Circle uses your location while the app is open so you can see yourself on the map and look at people who share with you. Trust Circle does not sell your location."
        )
    }
    public static var locationAlwaysPurpose: String {
        value(
            "location_always",
            defaultValue: "Trust Circle holds your location in escrow, including in the background, so a trusted adult peer can find you if they look. They cannot see it until they confirm a look, and you are notified. Trust Circle does not sell your location."
        )
    }
    public static var locationPrecisePurpose: String {
        value(
            "location_precise",
            defaultValue: "Trust Circle needs precise location so a trusted adult peer can find you if they look. Approximate location is not enough for escrow."
        )
    }

    // MARK: Auth errors

    public static var appleSignInFailed: String { value("apple_sign_in_failed", defaultValue: "Apple could not complete sign-in.") }
    public static var appleSignInTimedOut: String {
        value("apple_sign_in_timed_out", defaultValue: "Apple sign-in did not finish. Try again.")
    }
    public static var invalidAppleCredential: String {
        value("invalid_apple_credential", defaultValue: "Apple did not return a usable sign-in.")
    }
    public static var presentationUnavailable: String {
        value("presentation_unavailable", defaultValue: "Sign-in needs a window to present from.")
    }
    public static var signInInProgress: String { value("sign_in_in_progress", defaultValue: "Sign-in is already in progress.") }

    // MARK: Network errors (never raw NSURLError)

    public static var signInExpired: String { value("sign_in_expired", defaultValue: "Sign in expired. Sign in again.") }
    public static var cannotReachServer: String {
        value("cannot_reach_server", defaultValue: "Trust Circle can’t reach the server. Check your connection.")
    }
    public static func cannotReachHost(_ host: String) -> String {
        format("cannot_reach_host", defaultValue: "Trust Circle can’t reach %@. Start the API or wait for production.", host)
    }
    public static var signInTimedOut: String { value("sign_in_timed_out", defaultValue: "Timed out. Try again.") }
    public static func signInTimedOutHost(_ host: String) -> String {
        format("sign_in_timed_out_host", defaultValue: "Timed out talking to %@.", host)
    }
    public static var serverUnavailable: String {
        value("server_unavailable", defaultValue: "Trust Circle’s server is temporarily unavailable. Try again shortly.")
    }
    public static func serverUnavailableHost(status: Int, host: String) -> String {
        format("server_unavailable_host", defaultValue: "Trust Circle’s server is unavailable (%d) at %@.", status, host)
    }
    public static var decodingError: String {
        value("decoding_error", defaultValue: "The server sent something this app could not read.")
    }
    public static var requestFailed: String { value("request_failed", defaultValue: "Request failed.") }
    public static func requestFailedStatus(_ status: Int) -> String {
        format("request_failed_status", defaultValue: "Request failed (%d).", status)
    }
    public static func cannotReachLocal(_ host: String) -> String {
        format("cannot_reach_local", defaultValue: "Trust Circle can’t reach %@. Start the API on port 5088, or deploy production.", host)
    }

    /// Known API error codes → plain copy. Unknown codes pass the server message through.
    public static func apiError(code: String?, fallback: String?) -> String {
        switch code {
        case "confirmation_required":
            return value("api_confirmation_required", defaultValue: "Look needs a confirm first.")
        case "not_connected":
            return value("api_not_connected", defaultValue: "This person is not in your circle.")
        case "pair_inactive":
            return value("api_pair_inactive", defaultValue: "This connection is no longer active.")
        case "invalid_code":
            return value("api_invalid_code", defaultValue: "That invite code doesn’t match or has expired.")
        case "own_invite":
            return value("api_own_invite", defaultValue: "That’s your own invite.")
        case "seat_limit":
            return value("api_seat_limit", defaultValue: "Free is 5 people. Plus is 20.")
        case "pro_required":
            return value("api_pro_required", defaultValue: "Always and For a while are Plus.")
        case "no_location":
            return value("api_no_location", defaultValue: "No location yet. They haven’t sent one.")
        case "share_off":
            return value("api_share_off", defaultValue: "Not sharing with you. They can set a mode in Sharing.")
        case "look_requires_sealed":
            return value("api_look_requires_sealed", defaultValue: "Their location is already available. Use View.")
        case "view_requires_available":
            return value("api_view_requires_available", defaultValue: "Sealed. Look instead — they’ll be notified.")
        case "unauthorized":
            return value("api_unauthorized", defaultValue: "Sign in is required.")
        case "invalid_handle":
            return value("api_invalid_handle", defaultValue: "That handle isn’t valid.")
        case "reserved_handle":
            return value("api_reserved_handle", defaultValue: "That handle is reserved.")
        case "handle_in_use":
            return value("api_handle_in_use", defaultValue: "That handle is taken.")
        case "invalid_phone":
            return value("api_invalid_phone", defaultValue: "Enter a valid phone number, including country code.")
        case "phone_in_use":
            return value("api_phone_in_use", defaultValue: "That phone is already on another Trust account.")
        case "otp_cooldown":
            return value("api_otp_cooldown", defaultValue: "Wait a moment before requesting another code.")
        case "otp_daily_limit":
            return value("api_otp_daily_limit", defaultValue: "Too many codes today. Try again tomorrow.")
        case "otp_expired":
            return value("api_otp_expired", defaultValue: "That code expired. Request a new one.")
        case "otp_invalid":
            return value("api_otp_invalid", defaultValue: "That code does not match.")
        case "otp_exhausted":
            return value("api_otp_exhausted", defaultValue: "Too many attempts. Request a new code.")
        case "otp_send_failed":
            return value("api_otp_send_failed", defaultValue: "The code could not be sent. Try again.")
        case "otp_not_configured":
            return value("api_otp_not_configured", defaultValue: "Phone verification is not available right now.")
        case "invalid_name":
            return value("api_invalid_name", defaultValue: "Enter a display name of at least two characters.")
        case "invalid_state":
            return value("api_invalid_state", defaultValue: "Presence must be Home, Away, or Hidden.")
        case "invalid_token":
            return value("api_invalid_token", defaultValue: "Sign-in could not be completed. Try again.")
        case "apple_unavailable":
            return value("api_apple_unavailable", defaultValue: "Apple sign-in timed out. Try again.")
        case "invalid_apple_token":
            return value("api_invalid_apple_token", defaultValue: "Apple could not verify this sign-in. Try again.")
        case "storekit_unavailable":
            return value("api_storekit_unavailable", defaultValue: "StoreKit is not available on this server.")
        case "storekit_unverified":
            return value("api_storekit_unverified", defaultValue: "Purchase or restore Plus, then try again.")
        case "invalid_storekit":
            return value("api_invalid_storekit", defaultValue: "The App Store transaction could not be verified.")
        case "storekit_account_mismatch":
            return subscriptionLinked
        case "storekit_not_linked":
            return value("api_storekit_not_linked", defaultValue: "This Apple transaction could not be linked to the signed-in Trust account.")
        case "invalid_device":
            return value("api_invalid_device", defaultValue: "A push token and installation id are required.")
        case "invalid_bundle":
            return value("api_invalid_bundle", defaultValue: "That push topic is not this app.")
        case "invalid_product":
            return value("api_invalid_product", defaultValue: "That product is not available.")
        case "stripe_price_missing", "stripe_unconfigured", "stripe_error":
            return value("api_stripe_unavailable", defaultValue: "Web checkout is not available. Use Plus on iPhone.")
        default:
            let trimmed = fallback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? requestFailed : trimmed
        }
    }
}
