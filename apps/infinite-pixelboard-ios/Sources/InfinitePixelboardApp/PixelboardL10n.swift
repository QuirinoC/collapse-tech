import Foundation

enum PixelboardL10n {
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

    static let settings = value("settings", defaultValue: "Settings")
    static let infinitePixelboardHeader = value(
        "infinite_pixelboard_header",
        defaultValue: "INFINITE PIXELBOARD"
    )
    static let publicFieldHeader = value(
        "public_field_header",
        defaultValue: "PUBLIC FIELD 001"
    )
    static let close = value("close", defaultValue: "Close")
    static let account = value("account", defaultValue: "Account")
    static let share = value("share", defaultValue: "Share")
    static let report = value("report", defaultValue: "Report")
    static let shareThisPosition = value(
        "share_this_position",
        defaultValue: "Share this position"
    )
    static let reportCurrentPosition = value(
        "report_current_position",
        defaultValue: "Report current position"
    )
    static let continueWithApple = value(
        "continue_with_apple",
        defaultValue: "Continue with Apple"
    )
    static let continueWithGoogle = value(
        "continue_with_google",
        defaultValue: "Continue with Google"
    )
    static let acceptCommunityStandards = value(
        "accept_community_standards",
        defaultValue: "Accept community standards"
    )
    static let signOut = value("sign_out", defaultValue: "Sign out")
    static let notifications = value("notifications", defaultValue: "Notifications")
    static let enableNotificationsHeading = value(
        "enable_notifications_heading",
        defaultValue: "Never miss a limit lift."
    )
    static let enableNotificationsNote = value(
        "enable_notifications_note",
        defaultValue: "Get notified when limits are lifted for free. We send a quiet daily digest only after meaningful activity."
    )
    static let enableNotifications = value(
        "enable_notifications",
        defaultValue: "Enable notifications"
    )
    static let openNotificationSettings = value(
        "open_notification_settings",
        defaultValue: "Open notification settings"
    )
    static let inviteAPainter = value(
        "invite_a_painter",
        defaultValue: "Invite a painter"
    )
    static let pro = value("pro", defaultValue: "Pro")
    static let getPro = value("get_pro", defaultValue: "Get Pro")
    static let loginToGetPro = value(
        "login_to_get_pro",
        defaultValue: "Log in to get Pro for increased limits."
    )
    static let more = value("more", defaultValue: "More")
    static let subscriptionLoading = value(
        "subscription_loading",
        defaultValue: "Subscription options are still loading. Check your connection and try again."
    )
    static let copyInviteLink = value(
        "copy_invite_link",
        defaultValue: "Share invite link"
    )
    static let haveACode = value("have_a_code", defaultValue: "Have a code?")
    static let redeemInvite = value("redeem_invite", defaultValue: "Redeem invite")
    static let publicPixelsNote = value(
        "public_pixels_note",
        defaultValue: "Pixels you place are public. Anyone can overwrite them."
    )
    static let privacy = value("privacy", defaultValue: "Privacy")
    static let terms = value("terms", defaultValue: "Terms")
    static let permanentlyDeleteAccount = value(
        "permanently_delete_account",
        defaultValue: "Permanently delete this account?"
    )
    static let deleteAccount = value("delete_account", defaultValue: "Delete account")
    static let tryProNote = value(
        "try_pro_note",
        defaultValue: "Try Pro free for 7 days. Then choose monthly or annual billing. Pro is 1 second between pixels and unlocks the extended palette plus custom colors; it does not remove the cooldown."
    )
    static let proAvailableNote = value(
        "pro_available_note",
        defaultValue: "Pro is available with monthly or annual billing. It unlocks the extended palette and custom colors; the cooldown remains one second."
    )
    static let proActiveNote = value(
        "pro_active_note",
        defaultValue: "Pro is active. You can switch from monthly to annual billing below when available."
    )
    static let stripeProActiveNote = value(
        "stripe_pro_active_note",
        defaultValue: "Pro is active through Stripe. Use Stripe subscription settings below."
    )
    static let subscriptionLinkedElsewhere = value(
        "subscription_linked_elsewhere",
        defaultValue: "This Apple subscription is linked to another Pixelboard account and was not transferred."
    )
    static let subscriptionTransferReviewHeading = value(
        "subscription_transfer_review_heading",
        defaultValue: "Apple subscription needs support review"
    )
    static let subscriptionTransferReviewNote = value(
        "subscription_transfer_review_note",
        defaultValue: "This Apple subscription is linked to another Pixelboard account and was not transferred. Restore Purchases only re-syncs an Apple subscription; it does not move it between Apple IDs, Google sign-in, or Pixelboard accounts. An approved transfer would remove Pro access from the previous Pixelboard account."
    )
    static let subscriptionContactSupport = value(
        "subscription_contact_support",
        defaultValue: "Contact hello@collapsetechnologies.com for verification"
    )
    static let restorePurchasesNote = value(
        "restore_purchases_note",
        defaultValue: "Restore Purchases re-syncs your Apple subscription. It does not move it between Apple IDs, Google sign-in, or Pixelboard accounts."
    )
    static let restorePurchases = value(
        "restore_purchases",
        defaultValue: "Restore purchases"
    )
    static let subscriptionSettings = value(
        "subscription_settings",
        defaultValue: "Apple subscription settings"
    )
    static let stripeSubscriptionSettings = value(
        "stripe_subscription_settings",
        defaultValue: "Stripe subscription settings"
    )
    static let signInBeforeSubscribing = value(
        "sign_in_before_subscribing",
        defaultValue: "Sign in before subscribing."
    )
    static let shareInviteNote = value(
        "share_invite_note",
        defaultValue: "Share your code. When they sign in and accept the standards, they get 4 hours at a 2-second cooldown. You get 4 hours at 3 seconds. This is not Pro, and it never removes the cooldown."
    )

    static let ink = value("ink", defaultValue: "Ink")
    static let zoomOut = value("zoom_out", defaultValue: "Zoom out")
    static let zoomIn = value("zoom_in", defaultValue: "Zoom in")
    static let moveUp = value("move_up", defaultValue: "Move up")
    static let moveDown = value("move_down", defaultValue: "Move down")
    static let moveLeft = value("move_left", defaultValue: "Move left")
    static let moveRight = value("move_right", defaultValue: "Move right")
    static let goToCoordinates = value(
        "go_to_coordinates",
        defaultValue: "Go to coordinates"
    )
    static let customColor = value("custom_color", defaultValue: "Custom color")
    static let chooseCustomProColor = value(
        "choose_custom_pro_color",
        defaultValue: "Choose a custom Pro color"
    )
    static let unlockCustomColors = value(
        "unlock_custom_colors",
        defaultValue: "Unlock custom colors with Pro"
    )
    static let placePixel = value("place_pixel", defaultValue: "Place pixel")
    static let updateToKeepPainting = value(
        "update_to_keep_painting",
        defaultValue: "Update Infinite Pixelboard to keep painting."
    )
    static let paintingPaused = value(
        "painting_paused",
        defaultValue: "Painting is paused."
    )
    static let signInToPlacePixel = value(
        "sign_in_to_place_pixel",
        defaultValue: "Sign in to place a pixel"
    )
    static let bannedFromPlacing = value(
        "banned_from_placing",
        defaultValue: "This account is banned from placing pixels."
    )
    static let reconcilingPlacement = value(
        "reconciling_placement",
        defaultValue: "Reconciling placement…"
    )
    static let acceptStandardsFirst = value(
        "accept_standards_first",
        defaultValue: "Accept the community standards first"
    )
    static let pixelPlaced = value("pixel_placed", defaultValue: "Pixel placed")
    static let live = value("live", defaultValue: "Live")
    static let syncing = value("syncing", defaultValue: "Syncing")
    static let retrying = value("retrying", defaultValue: "Retrying")
    static let offline = value("offline", defaultValue: "Offline")
    static let liveUpdatesConnected = value(
        "live_updates_connected",
        defaultValue: "Live updates connected"
    )
    static let offlineTilesMayBeStale = value(
        "offline_tiles_may_be_stale",
        defaultValue: "Offline. Tiles may be stale."
    )
    static let advertisement = value("advertisement", defaultValue: "Advertisement")
    static let infinitePixelBoard = value(
        "infinite_pixel_board",
        defaultValue: "Infinite pixel board"
    )
    static let collapseTechnologiesInfinitePixelboard = value(
        "collapse_technologies_infinite_pixelboard",
        defaultValue: "Collapse Technologies Infinite Pixelboard"
    )

    static let navigate = value("navigate", defaultValue: "Navigate")
    static let goToCoordinatesHeading = value(
        "go_to_coordinates_heading",
        defaultValue: "Go to\ncoordinates."
    )
    static let enterCoordinatesNote = value(
        "enter_coordinates_note",
        defaultValue: "Enter a row and column to center that pixel on the board."
    )
    static let row = value("row", defaultValue: "Row")
    static let column = value("column", defaultValue: "Column")
    static let width = value("width", defaultValue: "Width")
    static let height = value("height", defaultValue: "Height")
    static let origin = value("origin", defaultValue: "Origin (0,0)")
    static let selectedPosition = value(
        "selected_position",
        defaultValue: "Selected position"
    )
    static let centerBoard = value("center_board", defaultValue: "Center board")
    static let wholeNumberCoordinates = value(
        "whole_number_coordinates",
        defaultValue: "Enter whole-number coordinates."
    )

    static let communitySafety = value(
        "community_safety",
        defaultValue: "Community safety"
    )
    static let reportCurrentPositionHeading = value(
        "report_current_position_heading",
        defaultValue: "Report\ncurrent position."
    )
    static let reportAreaNote = value(
        "report_area_note",
        defaultValue: "Mark the affected area. We capture the pixels and placement history. You do not need a screenshot."
    )
    static let reason = value("reason", defaultValue: "Reason")
    static let selectAReason = value("select_a_reason", defaultValue: "Select a reason")
    static let note = value("note", defaultValue: "Note")
    static let requiredNoteHint = value(
        "required_note_hint",
        defaultValue: "Required · 500 characters"
    )
    static let optionalNoteHint = value(
        "optional_note_hint",
        defaultValue: "Optional · 500 characters"
    )
    static let submitReport = value("submit_report", defaultValue: "Submit report")
    static let submitting = value("submitting", defaultValue: "Submitting…")
    static let signInBeforeReport = value(
        "sign_in_before_report",
        defaultValue: "Sign in before submitting a report."
    )
    static let otherReasonNoteRequired = value(
        "other_reason_note_required",
        defaultValue: "A note is required when the reason is Other."
    )
    static let explicitSexualContent = value(
        "explicit_sexual_content",
        defaultValue: "Explicit sexual content"
    )
    static let graphicViolence = value("graphic_violence", defaultValue: "Graphic violence")
    static let hateOrHarassment = value(
        "hate_or_harassment",
        defaultValue: "Hate or harassment"
    )
    static let threat = value("threat", defaultValue: "Threat")
    static let illegalContent = value("illegal_content", defaultValue: "Illegal content")
    static let copyright = value("copyright", defaultValue: "Copyright")
    static let other = value("other", defaultValue: "Other")

    static let loadingBoard = value("loading_board", defaultValue: "Loading board")
    static let readOnlyBoard = value("read_only_board", defaultValue: "Board is read-only")
    static let placementNotReady = value(
        "placement_not_ready",
        defaultValue: "Placement is not ready"
    )
    static let placementRejected = value(
        "placement_rejected",
        defaultValue: "The pixel placement was rejected."
    )
    static let accountDeleted = value("account_deleted", defaultValue: "Account deleted")
    static let signInToReport = value(
        "sign_in_to_report",
        defaultValue: "Sign in to report content"
    )
    static let chooseReportReason = value(
        "choose_report_reason",
        defaultValue: "Choose a report reason"
    )
    static let reportReceived = value("report_received", defaultValue: "Report received")
    static let inviteCodeLength = value(
        "invite_code_length",
        defaultValue: "Enter an 8-character invite code."
    )
    static let inviteApplied = value(
        "invite_applied",
        defaultValue: "Invite applied. Faster painting is on for a few hours."
    )
    static let boardContractUnsupported = value(
        "board_contract_unsupported",
        defaultValue: "This board contract is not supported"
    )
    static let boardReadOnly = value("board_read_only", defaultValue: "Board is read-only")
    static let storeKitVerificationFailed = value(
        "storekit_verification_failed",
        defaultValue: "The App Store transaction could not be verified on this device."
    )
    static let appleSignInFailed = value(
        "apple_sign_in_failed",
        defaultValue: "Apple could not complete sign-in. Try again, or use Google."
    )
    static let invalidAppleCredential = value(
        "invalid_apple_credential",
        defaultValue: "Apple returned an unsupported sign-in credential."
    )
    static let missingAppleAuthorizationCode = value(
        "missing_apple_authorization_code",
        defaultValue: "Apple did not return the authorization code required to delete this account."
    )
    static let missingAppleIDToken = value(
        "missing_apple_id_token",
        defaultValue: "Apple did not return an identity token."
    )
    static let missingGoogleIDToken = value(
        "missing_google_id_token",
        defaultValue: "Google did not return an identity token."
    )
    static let nonceGenerationFailed = value(
        "nonce_generation_failed",
        defaultValue: "A secure sign-in nonce could not be generated."
    )
    static let presentationUnavailable = value(
        "presentation_unavailable",
        defaultValue: "A sign-in window is not available."
    )
    static let signInInProgress = value(
        "sign_in_in_progress",
        defaultValue: "Another sign-in request is already in progress."
    )

    static func readyIn(_ seconds: Int) -> String {
        format(
            "ready_in_seconds",
            defaultValue: "Ready in %llds",
            seconds
        )
    }

    static func selectColor(_ color: String) -> String {
        format(
            "select_color",
            defaultValue: "Select color %@",
            color
        )
    }

    static func subscribeMonthly(price: String) -> String {
        format(
            "subscribe_monthly",
            defaultValue: "Subscribe monthly · %@",
            price
        )
    }

    static func subscribeAnnually(price: String) -> String {
        format(
            "subscribe_annually",
            defaultValue: "Subscribe annually · %@",
            price
        )
    }

    static func switchToAnnual(price: String) -> String {
        format(
            "switch_to_annual",
            defaultValue: "Switch to annual · %@",
            price
        )
    }

    static func selectedPosition(row: Int, column: Int) -> String {
        format(
            "selected_position_accessibility",
            defaultValue: "Selected row %lld, column %lld",
            row,
            column
        )
    }

    static func coordinate(row: String, column: String) -> String {
        format(
            "coordinate",
            defaultValue: "ROW %@ / COL %@",
            row,
            column
        )
    }

    static func liveUpdatesStatus(_ status: String) -> String {
        format(
            "live_updates_status",
            defaultValue: "Live updates %@. You can still paint.",
            status
        )
    }

    static func liveUpdates(_ state: String) -> String {
        format(
            "live_updates",
            defaultValue: "Live updates %@",
            state
        )
    }

    static func colorPickerProLabel(_ color: String) -> String {
        format(
            "custom_color_pro_label",
            defaultValue: "Choose a custom Pro color: %@",
            color
        )
    }
}
