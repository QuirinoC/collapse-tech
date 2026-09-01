import Foundation

public enum TrustCopy {
    /// Product name. Do not translate.
    public static let appName = "Trust Circle"
    /// Large Masthead lockup. Two words at display size do not fit. Do not translate.
    public static let mastheadName = "Trust"
    public static let historyHours = 2

    static func value(
        _ key: String,
        defaultValue: String
    ) -> String {
        NSLocalizedString(
            key,
            tableName: "Localizable",
            bundle: .main,
            value: defaultValue,
            comment: ""
        )
    }

    private static func format(
        _ key: String,
        defaultValue: String,
        _ argument: CVarArg
    ) -> String {
        String.localizedStringWithFormat(
            value(key, defaultValue: defaultValue),
            argument
        )
    }

    private static func format(
        _ key: String,
        defaultValue: String,
        _ first: CVarArg,
        _ second: CVarArg
    ) -> String {
        String.localizedStringWithFormat(
            value(key, defaultValue: defaultValue),
            first,
            second
        )
    }

    private static func format(
        _ key: String,
        defaultValue: String,
        _ first: CVarArg,
        _ second: CVarArg,
        _ third: CVarArg
    ) -> String {
        String.localizedStringWithFormat(
            value(key, defaultValue: defaultValue),
            first,
            second,
            third
        )
    }

    private static func format(
        _ key: String,
        defaultValue: String,
        _ first: CVarArg,
        _ second: CVarArg,
        _ third: CVarArg,
        _ fourth: CVarArg
    ) -> String {
        String.localizedStringWithFormat(
            value(key, defaultValue: defaultValue),
            first,
            second,
            third,
            fourth
        )
    }

    private static func format(
        _ key: String,
        defaultValue: String,
        _ first: CVarArg,
        _ second: CVarArg,
        _ third: CVarArg,
        _ fourth: CVarArg,
        _ fifth: CVarArg
    ) -> String {
        String.localizedStringWithFormat(
            value(key, defaultValue: defaultValue),
            first,
            second,
            third,
            fourth,
            fifth
        )
    }

    public static var openLocation: String { value("open_location", defaultValue: "Open location") }
    public static var cancel: String { value("cancel", defaultValue: "Cancel") }
    public static var close: String { value("close", defaultValue: "Close") }
    public static var done: String { value("done", defaultValue: "Done") }
    public static var look: String { value("look", defaultValue: "Look") }
    public static var whatItIs: String {
        value("what_it_is", defaultValue: "Location stays hidden until someone looks.")
    }

    public static var you: String { value("you", defaultValue: "You") }
    public static var them: String { value("them", defaultValue: "them") }
    public static var live: String { value("live", defaultValue: "Live") }
    public static var sealed: String { value("sealed", defaultValue: "SEALED") }
    public static var settings: String { value("settings", defaultValue: "Settings") }
    public static var signOut: String { value("sign_out", defaultValue: "Sign out") }
    public static var privacy: String { value("privacy", defaultValue: "Privacy") }
    public static var terms: String { value("terms", defaultValue: "Terms") }
    public static var termsOfService: String { value("terms_of_service", defaultValue: "Terms of Service") }
    public static var support: String { value("support", defaultValue: "Support") }
    public static var more: String { value("more", defaultValue: "More") }
    public static var on: String { value("on", defaultValue: "On") }
    public static var off: String { value("off", defaultValue: "Off") }
    public static var notification: String { value("notification", defaultValue: "Notification") }
    public static var continueAction: String { value("continue", defaultValue: "Continue") }
    public static var verify: String { value("verify", defaultValue: "Verify") }
    public static var join: String { value("join", defaultValue: "Join") }
    public static var revoke: String { value("revoke", defaultValue: "Revoke") }
    public static var deleteAccount: String { value("delete_account", defaultValue: "Delete account") }
    public static var restorePurchases: String { value("restore_purchases", defaultValue: "Restore purchases") }
    public static var free: String { value("free", defaultValue: "Free") }
    public static var circle: String { value("circle", defaultValue: "Circle") }
    public static var getCircle: String { value("get_circle", defaultValue: "Get Circle") }
    public static var lookLog: String { value("look_log", defaultValue: "Look log") }
    public static var logAbbrev: String { value("log_abbrev", defaultValue: "LOG") }

    public static var untilTheyLook: String { value("until_they_look", defaultValue: "Until they look") }
    public static var always: String { value("always", defaultValue: "Always") }
    public static var forAWhile: String { value("for_a_while", defaultValue: "For a while") }
    public static var shareForAWhile: String { value("share_for_a_while", defaultValue: "Share for a while") }
    public static var firstOpenLine: String {
        value("first_open_line", defaultValue: "Location stays with you until someone looks.")
    }
    public static var inviteLine: String { value("invite_line", defaultValue: "I trust you with my location.") }

    public static var signInWithApple: String { value("sign_in_with_apple", defaultValue: "Sign in with Apple") }
    public static var signingIn: String { value("signing_in", defaultValue: "Signing in…") }
    public static var signingInShort: String { value("signing_in_short", defaultValue: "Signing in") }
    public static var trustUsesSignInWithApple: String {
        value("trust_uses_sign_in_with_apple", defaultValue: "Trust uses Sign in with Apple.")
    }

    public static var yourProfile: String { value("your_profile", defaultValue: "Your profile") }
    public static var yourHandle: String { value("your_handle", defaultValue: "Your handle") }
    public static var onboardingIntro: String {
        value(
            "onboarding_intro",
            defaultValue: "Pick a unique handle. That’s you on Trust. Location stays with you until someone looks."
        )
    }
    public static var handle: String { value("handle", defaultValue: "Handle") }
    public static var handleRules: String {
        value(
            "handle_rules",
            defaultValue: "3–20 characters. Letters, numbers, and underscores. Must start with a letter."
        )
    }
    public static var handleAvailable: String { value("handle_available", defaultValue: "Available") }
    public static var handleTaken: String { value("handle_taken", defaultValue: "Taken") }
    public static var handleReserved: String { value("handle_reserved", defaultValue: "Reserved") }
    public static var handleInvalid: String {
        value("handle_invalid", defaultValue: "That handle isn’t valid.")
    }
    public static var enterHandle: String {
        value("enter_handle", defaultValue: "Enter a handle to continue.")
    }
    public static var displayName: String { value("display_name", defaultValue: "Display name") }
    public static var yourName: String { value("your_name", defaultValue: "Your name") }
    public static var phone: String { value("phone", defaultValue: "Phone") }
    public static var verified: String { value("verified", defaultValue: "Verified") }
    public static var sendCode: String { value("send_code", defaultValue: "Send code") }
    public static var code: String { value("code", defaultValue: "Code") }
    public static var sixDigits: String { value("six_digits", defaultValue: "6 digits") }
    public static var enterPhoneWithCountry: String {
        value("enter_phone_with_country", defaultValue: "Enter a phone number with country code.")
    }
    public static var developmentNoSms: String {
        value("development_no_sms", defaultValue: "Development: no SMS was sent. Enter the code shown below.")
    }
    public static var enterSixDigitCode: String {
        value("enter_six_digit_code", defaultValue: "Enter the 6-digit code.")
    }
    public static var enterDisplayNameTwoChars: String {
        value("enter_display_name_two_chars", defaultValue: "Enter a display name of at least two characters.")
    }
    public static var verifyPhoneToContinue: String {
        value("verify_phone_to_continue", defaultValue: "Verify your phone to continue.")
    }

    public static func textedCode(to masked: String) -> String {
        format("texted_code_to", defaultValue: "We texted a code to %@.", masked)
    }

    public static func developmentCode(_ code: String) -> String {
        format("development_code", defaultValue: "Development code %@", code)
    }

    public static var theyAreLooking: String { value("they_are_looking", defaultValue: "They’re looking") }
    public static var alwaysForSharing: String { value("always_for_sharing", defaultValue: "Always for sharing") }
    public static var openSettings: String { value("open_settings", defaultValue: "Open Settings") }
    public static var allowAlways: String { value("allow_always", defaultValue: "Allow always") }
    public static var openMap: String { value("open_map", defaultValue: "Open map") }
    public static var circleMapAccessibility: String {
        value(
            "circle_map_accessibility",
            defaultValue: "Circle map. Live people are pins. Sealed people stay locked until you look."
        )
    }

    public static func inviteAccessibility(line: String) -> String {
        format("invite_accessibility", defaultValue: "Invite. %@", line)
    }

    public static func visibleNowAccessibility(name: String, verb: String) -> String {
        format("visible_now_accessibility", defaultValue: "%@, visible now. %@", name, verb)
    }

    public static func sealedAccessibility(name: String, verb: String) -> String {
        format("sealed_accessibility", defaultValue: "%@, sealed. %@", name, verb)
    }

    public static func lookLogChrome(now: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.setLocalizedDateFormatFromTemplate("dMMM")
        return "\(formatter.string(from: now).uppercased()) · \(logAbbrev)"
    }

    public static var inviteSomeone: String { value("invite_someone", defaultValue: "Invite someone") }
    public static var inviteSomeoneBody: String {
        value(
            "invite_someone_body",
            defaultValue: "They cannot see your coordinates until they look. The look itself is free."
        )
    }
    public static var createInvite: String { value("create_invite", defaultValue: "Create invite") }
    public static var shareInvite: String { value("share_invite", defaultValue: "Share invite") }
    public static var joinWithCode: String { value("join_with_code", defaultValue: "Join with code") }
    public static var shareThisCode: String {
        value(
            "share_this_code",
            defaultValue: "Share this code. They cannot see you until they join and later look."
        )
    }

    public static func confirmTitle(subject: String) -> String {
        format("confirm_title", defaultValue: "Open %@’s location?", subject)
    }

    public static func confirmBody(subject: String, looksToday: Int) -> String {
        if looksToday >= 2 {
            return format(
                "confirm_body_repeat",
                defaultValue: "You have opened %@’s location %lld times today. You will see their live location and the last %lld hours of movement. %@ will be notified immediately. This cannot be undone.",
                subject,
                looksToday,
                historyHours,
                subject
            )
        }
        return format(
            "confirm_body",
            defaultValue: "You will see their live location and the last %lld hours of movement. %@ will be notified immediately. This cannot be undone.",
            historyHours,
            subject
        )
    }

    public static func lookSheetSummary(name: String) -> String {
        format(
            "look_sheet_summary",
            defaultValue: "Live location, the last 2 hours, and a receipt to %@. This cannot be undone.",
            name
        )
    }

    public static var factLiveLocation: String { value("fact_live_location", defaultValue: "Live location") }
    public static var factLastHours: String { value("fact_last_hours", defaultValue: "Last 2 hours of movement") }

    public static func factNotifiedImmediately(name: String) -> String {
        format("fact_notified_immediately", defaultValue: "%@ is notified immediately", name)
    }

    public static var quietNotAlarm: String {
        value(
            "quiet_not_alarm",
            defaultValue: "A quiet notification — not an alarm. There is no “don’t ask again.”"
        )
    }

    public static func receiptTitle(viewer: String) -> String {
        format("receipt_title", defaultValue: "%@ viewed your location", viewer)
    }

    public static func receiptBody() -> String {
        format(
            "receipt_body",
            defaultValue: "They can see your live location and the last %lld hours of history.",
            historyHours
        )
    }

    public static var lookClosed: String { value("look_closed", defaultValue: "Look closed.") }
    public static var watchingNow: String { value("watching_now", defaultValue: "Watching now") }

    public static func lastHours(_ hours: Int) -> String {
        format("last_n_hours", defaultValue: "Last %lld hours", hours)
    }

    public static func subjectNotified(name: String) -> String {
        format("subject_notified", defaultValue: "%@ was notified. Closing ends this look.", name)
    }

    public static var includeLast24Hours: String {
        value("include_last_24_hours", defaultValue: "Include last 24 hours")
    }

    public static var everyLookStays: String { value("every_look_stays", defaultValue: "Every look stays.") }

    public static func lookLogIntroText(freeDays: Int = 30) -> String {
        format(
            "look_log_intro",
            defaultValue: "Append-only while the account exists. Deleting your account removes your location and look history. Free keeps %lld days. Circle keeps a year and can export.",
            freeDays
        )
    }

    public static var noLooksYet: String { value("no_looks_yet", defaultValue: "No looks yet.") }

    public static func olderLooksHeld(_ count: Int) -> String {
        format("older_looks_held", defaultValue: "%lld older looks are held for Circle retention.", count)
    }

    public static var exportLog: String { value("export_log", defaultValue: "Export log") }
    public static var circleKeepsLog: String {
        value(
            "circle_keeps_log",
            defaultValue: "Circle keeps the log for a year and lets either of you export. Looking is already included."
        )
    }

    public static func lookedAtRow(name: String, hours: Int) -> String {
        format("looked_at_row", defaultValue: "Looked at %@ · live + last %lldh", name, hours)
    }

    public static func lookLogExportRow(
        timestamp: String,
        viewer: String,
        subject: String,
        live: Bool,
        hours: Int
    ) -> String {
        format(
            "look_log_export_row",
            defaultValue: "%@\t%@ looked at %@\t%@ + last %lldh",
            timestamp,
            viewer,
            subject,
            live ? exportLive : exportNoLive,
            hours
        )
    }

    public static var exportLive: String { value("export_live", defaultValue: "live") }
    public static var exportNoLive: String { value("export_no_live", defaultValue: "no live") }

    public static func whatNameCanSee(name: String) -> String {
        format("what_name_can_see", defaultValue: "What %@ can see", name)
    }

    public static var shareSheetIntro: String {
        value(
            "share_sheet_intro",
            defaultValue: "This is your location, not theirs. When sealed, they still use Look — live, two hours, a receipt."
        )
    }
    public static var tagDefault: String { value("tag_default", defaultValue: "Default") }
    public static var tagException: String { value("tag_exception", defaultValue: "Exception") }

    public static func untilTheyLookBody(name: String) -> String {
        format(
            "until_they_look_body",
            defaultValue: "Nothing until %@ looks. Then live + last 2 hours, and you get a receipt.",
            name
        )
    }

    public static func alwaysBody(name: String) -> String {
        format(
            "always_body",
            defaultValue: "%@ always sees your live location. Stays until you turn it off.",
            name
        )
    }

    public static func forAWhileBody(name: String) -> String {
        format(
            "for_a_while_body",
            defaultValue: "%@ sees you until a timer ends. Then this goes back to whatever you had before — not a new default.",
            name
        )
    }

    public static var shareModesFootnote: String {
        value(
            "share_modes_footnote",
            defaultValue: "Always and For a while are opt-in per person. Everyone else stays Until they look."
        )
    }

    public static func timedOverlayIntro(name: String) -> String {
        format(
            "timed_overlay_intro",
            defaultValue: "Temporary overlay. When the timer ends, %@ returns to the setting you already had.",
            name
        )
    }

    public static var howLong: String { value("how_long", defaultValue: "How long") }
    public static var timedHour: String { value("timed_hour", defaultValue: "1 hour") }
    public static var timedTonight: String { value("timed_tonight", defaultValue: "Tonight") }
    public static var timedHome: String { value("timed_home", defaultValue: "Until I get home") }
    public static var afterHour: String { value("after_hour", defaultValue: "After 1 hour") }
    public static var afterTonight: String { value("after_tonight", defaultValue: "After tonight") }
    public static var afterHome: String { value("after_home", defaultValue: "When you get home") }

    public static func timedShareSentence(after: String, name: String, revertsToLook: Bool) -> String {
        if revertsToLook {
            return format(
                "timed_sentence_look",
                defaultValue: "%@, %@ will only see your location if they look — unless you’ve set something else for them.",
                after,
                name
            )
        }
        return format(
            "timed_sentence_always",
            defaultValue: "%@, %@ goes back to Always — your current setting.",
            after,
            name
        )
    }

    public static func timedRevertLine(revertsToLook: Bool) -> String {
        if revertsToLook {
            return value(
                "timed_revert_look",
                defaultValue: "Goes back to Until they look — your current setting."
            )
        }
        return value(
            "timed_revert_always",
            defaultValue: "They keep seeing your live location. This timer does not switch them to Until they look."
        )
    }

    public static func inviteMessage(code: String) -> String {
        "\(inviteLine)\nhttps://trust.collapsetechnologies.com/i/\(code)\ntrust://invite/\(code)"
    }

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

    public static var locationPurpose: String { locationAlwaysPurpose }

    public static var alwaysNeededForSharing: String {
        value(
            "always_needed_for_sharing",
            defaultValue: "Sharing needs Always so a look still works when Trust Circle is closed."
        )
    }

    public static var keptWhileUsing: String {
        value(
            "kept_while_using",
            defaultValue: "You kept While Using. Escrow and Always share only update while Trust Circle is open. Change to Always in iOS Settings so a look still works when the app is closed."
        )
    }

    public static var locationDeniedBody: String {
        value(
            "location_denied_body",
            defaultValue: "Location is off. You can still see people who share with you and look at them. Your pin waits until you allow While Using."
        )
    }

    public static var locationReducedAccuracy: String {
        value(
            "location_reduced_accuracy",
            defaultValue: "Approximate location is on. Escrow needs precise location."
        )
    }

    public static var weDoNotSellLocation: String {
        value(
            "we_do_not_sell_location",
            defaultValue: "We do not sell location. There are no ads and no data brokerage."
        )
    }

    public static var location: String { value("location", defaultValue: "Location") }
    public static var permission: String { value("permission", defaultValue: "Permission") }
    public static var accuracy: String { value("accuracy", defaultValue: "Accuracy") }
    public static var sharing: String { value("sharing", defaultValue: "Sharing") }
    public static var ingest: String { value("ingest", defaultValue: "Ingest") }
    public static var feed: String { value("feed", defaultValue: "Feed") }
    public static var whileUsing: String { value("while_using", defaultValue: "While using") }
    public static var denied: String { value("denied", defaultValue: "Denied") }
    public static var notAsked: String { value("not_asked", defaultValue: "Not asked") }
    public static var unknown: String { value("unknown", defaultValue: "Unknown") }
    public static var precise: String { value("precise", defaultValue: "Precise") }
    public static var approximate: String { value("approximate", defaultValue: "Approximate") }
    public static var waiting: String { value("waiting", defaultValue: "Waiting") }
    public static var device: String { value("device", defaultValue: "Device") }
    public static var openIOSSettings: String { value("open_ios_settings", defaultValue: "Open iOS Settings") }
    public static var allowWhileUsing: String { value("allow_while_using", defaultValue: "Allow while using") }
    public static var allowPreciseLocation: String {
        value("allow_precise_location", defaultValue: "Allow precise location")
    }
    public static var allowQuietReceipts: String {
        value("allow_quiet_receipts", defaultValue: "Allow quiet receipts")
    }

    public static var signedOutSummary: String {
        value("signed_out_summary", defaultValue: "Not signed in. No ads. We do not sell location.")
    }

    public static func signedInSummary(method: String, name: String) -> String {
        format(
            "signed_in_summary",
            defaultValue: "Signed in with %@ as %@. No ads. We do not sell location.",
            method,
            name
        )
    }

    public static var edition: String { value("edition", defaultValue: "Edition") }
    public static var nightEdition: String { value("night_edition", defaultValue: "Night Edition") }
    public static var paperDefaultNote: String {
        value(
            "paper_default_note",
            defaultValue: "Paper is the default: white sheet, black streets, one red verb."
        )
    }
    public static var benefitFree: String {
        value("benefit_free", defaultValue: "One person, Look, last 2 hours, quiet receipts, 30-day log.")
    }
    public static var benefitCircle: String {
        value(
            "benefit_circle",
            defaultValue: "More people, 24-hour history, place pings, year-long log + export. One seat covers the unpaid partner."
        )
    }

    public static func circleMonthly(price: String) -> String {
        format("circle_monthly", defaultValue: "Circle monthly — %@", price)
    }

    public static func circleAnnual(price: String) -> String {
        format("circle_annual", defaultValue: "Circle annual — %@", price)
    }

    public static func circlePriceFallback(monthly: String, annual: String) -> String {
        format("circle_price_fallback", defaultValue: "Circle %@/mo or %@/yr. 7-day trial.", monthly, annual)
    }

    public static var circleLegal: String {
        value(
            "circle_legal",
            defaultValue: "Circle is an auto-renewing subscription. Payment is charged to your Apple ID at confirmation. It renews unless you cancel at least 24 hours before the period ends. Family Sharing is off. We do not sell location."
        )
    }
    public static var unlockCircleForReview: String {
        value("unlock_circle_for_review", defaultValue: "Unlock Circle for review")
    }
    public static var manageSubscription: String {
        value("manage_subscription", defaultValue: "Manage subscription")
    }
    public static var subscriptionLinked: String {
        value(
            "subscription_linked",
            defaultValue: "This Apple subscription is linked to another Trust Circle account. Contact hello@collapsetechnologies.com."
        )
    }
    public static var circleMembers: String { value("circle_members", defaultValue: "Circle members") }
    public static var trusted: String { value("trusted", defaultValue: "Trusted") }
    public static var plan: String { value("plan", defaultValue: "Plan") }
    public static var member: String { value("member", defaultValue: "Member") }
    public static var inviteFromMap: String {
        value(
            "invite_from_map",
            defaultValue: "Invite from the map. Free is one trusted person. Circle adds seats. Looking does not need Circle."
        )
    }
    public static var placePingGotHome: String { value("place_ping_got_home", defaultValue: "Place ping — got home") }
    public static var placePingCircle: String { value("place_ping_circle", defaultValue: "Place ping — Circle") }
    public static var checkIn: String { value("check_in", defaultValue: "Check in") }
    public static var revokePersonConfirm: String {
        value("revoke_person_confirm", defaultValue: "Revoke this person immediately?")
    }
    public static var deleteAccountConfirm: String {
        value(
            "delete_account_confirm",
            defaultValue: "Delete your Trust Circle account? Location, looks, and circle membership are removed. This cannot be undone."
        )
    }
    public static var sponsorNote: String {
        value(
            "sponsor_note",
            defaultValue: "You sponsor this circle. Unpaid people do not need to pay to share or look."
        )
    }

    public static func coveredBySponsor(name: String) -> String {
        format(
            "covered_by_sponsor",
            defaultValue: "%@’s Pro covers you. You can share and look without buying Circle.",
            name
        )
    }

    public static var yourPartner: String { value("your_partner", defaultValue: "Your partner") }
    public static var trialNote: String {
        value(
            "trial_note",
            defaultValue: "7-day trial. Free already includes the 1:1 look. Circle is extras, not a lock on looking."
        )
    }
    public static var freeIncludesLook: String {
        value(
            "free_includes_look",
            defaultValue: "Free already includes the 1:1 look. Circle is extras: more people, longer history, place pings, full log. One subscription covers two people."
        )
    }
    public static var bannerYourCircle: String {
        value("banner_your_circle", defaultValue: "Your Circle covers this pair")
    }

    public static func bannerSponsorCovers(name: String) -> String {
        format("banner_sponsor_covers", defaultValue: "%@’s Pro covers this circle", name)
    }

    public static func statusFreeCircle(hours: Int) -> String {
        format(
            "status_free_circle",
            defaultValue: "Free circle · 1 trusted person · last %lld hours on look",
            hours
        )
    }

    public static var appleSignInFailed: String {
        value("apple_sign_in_failed", defaultValue: "Apple could not complete sign-in.")
    }
    public static var appleSignInTimedOut: String {
        value("apple_sign_in_timed_out", defaultValue: "Apple sign-in did not finish. Try again.")
    }
    public static var invalidAppleCredential: String {
        value("invalid_apple_credential", defaultValue: "Apple did not return a usable sign-in.")
    }
    public static var presentationUnavailable: String {
        value("presentation_unavailable", defaultValue: "Sign-in needs a window to present from.")
    }
    public static var signInInProgress: String {
        value("sign_in_in_progress", defaultValue: "Sign-in is already in progress.")
    }
    public static var storeKitVerificationFailed: String {
        value("storekit_verification_failed", defaultValue: "StoreKit verification failed.")
    }

    public static var signInExpired: String {
        value("sign_in_expired", defaultValue: "Sign in expired. Please sign in again.")
    }
    public static var cannotReachServer: String {
        value("cannot_reach_server", defaultValue: "Trust Circle cannot reach the server. Check your connection.")
    }

    public static func cannotReachHost(_ host: String) -> String {
        format(
            "cannot_reach_host",
            defaultValue: "Trust Circle cannot reach %@. Start the API or wait until production is deployed.",
            host
        )
    }

    public static var signInTimedOut: String {
        value("sign_in_timed_out", defaultValue: "Sign-in timed out. Try again.")
    }

    public static func signInTimedOutHost(_ host: String) -> String {
        format("sign_in_timed_out_host", defaultValue: "Sign-in timed out talking to %@.", host)
    }

    public static var serverUnavailable: String {
        value(
            "server_unavailable",
            defaultValue: "Trust Circle's server is temporarily unavailable. Try again shortly."
        )
    }

    public static func serverUnavailableHost(status: Int, host: String) -> String {
        format(
            "server_unavailable_host",
            defaultValue: "Trust Circle's server is unavailable (%lld) at %@.",
            status,
            host
        )
    }

    public static var decodingError: String {
        value("decoding_error", defaultValue: "The server sent a response this app could not read.")
    }
    public static var requestFailed: String { value("request_failed", defaultValue: "Request failed.") }

    public static func requestFailedStatus(_ status: Int) -> String {
        format("request_failed_status", defaultValue: "Request failed (%lld).", status)
    }

    public static func cannotReachLocal(_ host: String) -> String {
        format(
            "cannot_reach_local",
            defaultValue: "Trust Circle cannot reach %@. Start the API on port 5088, or deploy production.",
            host
        )
    }

    public static func apiError(code: String?, fallback: String?) -> String {
        switch code {
        case "confirmation_required":
            return value("api_confirmation_required", defaultValue: "Looking requires an explicit confirm.")
        case "not_connected":
            return value("api_not_connected", defaultValue: "This person is not in your circle.")
        case "pair_inactive":
            return value("api_pair_inactive", defaultValue: "This pair is no longer active.")
        case "invalid_code":
            return value("api_invalid_code", defaultValue: "That invite code does not match.")
        case "seat_limit":
            return value("api_seat_limit", defaultValue: "Free includes one trusted person. Circle adds seats.")
        case "pro_required":
            return value("api_pro_required", defaultValue: "Circle is required for this.")
        case "no_location":
            return value("api_no_location", defaultValue: "There is no location in escrow yet.")
        case "unauthorized":
            return value("api_unauthorized", defaultValue: "Sign in is required.")
        case "invalid_phone":
            return value("api_invalid_phone", defaultValue: "Enter a valid phone number, including country code.")
        case "otp_not_configured":
            return value("api_otp_not_configured", defaultValue: "Phone verification is not configured on this server.")
        case "otp_cooldown":
            return value("api_otp_cooldown", defaultValue: "Wait a moment before requesting another code.")
        case "otp_expired":
            return value("api_otp_expired", defaultValue: "That code expired. Request a new one.")
        case "otp_invalid":
            return value("api_otp_invalid", defaultValue: "That code does not match.")
        case "otp_exhausted":
            return value("api_otp_exhausted", defaultValue: "Too many attempts. Request a new code.")
        case "otp_send_failed":
            return value("api_otp_send_failed", defaultValue: "Trust could not send a text. Try again.")
        case "phone_in_use":
            return value("api_phone_in_use", defaultValue: "That phone is already on another Trust account.")
        case "invalid_handle":
            return value("api_invalid_handle", defaultValue: "That handle isn’t valid.")
        case "reserved_handle":
            return value("api_reserved_handle", defaultValue: "That handle is reserved.")
        case "handle_in_use":
            return value("api_handle_in_use", defaultValue: "That handle is taken.")
        case "own_invite":
            return value("api_own_invite", defaultValue: "You cannot join your own invite.")
        case "invalid_name":
            return value("api_invalid_name", defaultValue: "Enter a display name of at least two characters.")
        case "invalid_token":
            return value("api_invalid_token", defaultValue: "Sign-in could not be completed. Try again.")
        case "apple_unavailable":
            return value("api_apple_unavailable", defaultValue: "Apple sign-in timed out. Try again.")
        case "invalid_apple_token":
            return value("api_invalid_apple_token", defaultValue: "Apple could not verify this sign-in. Try again.")
        case "storekit_unavailable":
            return value("api_storekit_unavailable", defaultValue: "StoreKit is not available on this server.")
        case "storekit_unverified":
            return value("api_storekit_unverified", defaultValue: "Purchase or restore Circle, then try again.")
        case "invalid_storekit":
            return value("api_invalid_storekit", defaultValue: "The App Store transaction could not be verified.")
        case "storekit_account_mismatch":
            return value(
                "api_storekit_account_mismatch",
                defaultValue: "This Apple subscription is linked to another Trust account. Contact hello@collapsetechnologies.com."
            )
        case "storekit_not_linked":
            return value(
                "api_storekit_not_linked",
                defaultValue: "This Apple transaction could not be linked to the signed-in Trust account."
            )
        case "invalid_device":
            return value("api_invalid_device", defaultValue: "A push token and installation id are required.")
        case "invalid_bundle":
            return value("api_invalid_bundle", defaultValue: "That push topic is not this app.")
        case "invalid_product":
            return value("api_invalid_product", defaultValue: "That product is not available.")
        case "stripe_price_missing", "stripe_unconfigured", "stripe_error":
            return value("api_stripe_unavailable", defaultValue: "Web checkout is not available. Use Circle on iPhone.")
        default:
            let trimmed = fallback?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmed.isEmpty { return trimmed }
            if let code, !code.isEmpty { return requestFailed }
            return requestFailed
        }
    }
}
