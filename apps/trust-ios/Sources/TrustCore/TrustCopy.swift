import Foundation

public enum TrustCopy {
    public static let appName = "Trust Circle"
    /// Large Masthead lockup. Two words at display size do not fit.
    public static let mastheadName = "Trust"
    public static let historyHours = 2
    public static let openLocation = "Open location"
    public static let cancel = "Cancel"
    public static let look = "Look"
    public static let whatItIs = "Location stays hidden until someone looks."

    public static func confirmTitle(subject: String) -> String {
        "Open \(subject)’s location?"
    }

    public static func confirmBody(subject: String, looksToday: Int) -> String {
        let base =
            "You will see their live location and the last \(historyHours) hours of movement. \(subject) will be notified immediately. This cannot be undone."
        if looksToday >= 2 {
            return "You have opened \(subject)’s location \(looksToday) times today. " + base
        }
        return base
    }

    public static func receiptTitle(viewer: String) -> String {
        "\(viewer) viewed your location"
    }

    public static func receiptBody() -> String {
        "They can see your live location and the last \(historyHours) hours of history."
    }

    public static let locationWhenInUsePurpose =
        "Trust Circle uses your location while the app is open so you can see yourself on the map and look at people who share with you. Trust Circle does not sell your location."

    public static let locationAlwaysPurpose =
        "Trust Circle holds your location in escrow, including in the background, so a trusted adult peer can find you if they look. They cannot see it until they confirm a look, and you are notified. Trust Circle does not sell your location."

    public static let locationPrecisePurpose =
        "Trust Circle needs precise location so a trusted adult peer can find you if they look. Approximate location is not enough for escrow."

    public static let locationPurpose = locationAlwaysPurpose

    public static let alwaysNeededForSharing =
        "Sharing needs Always so a look still works when Trust Circle is closed."

    public static let keptWhileUsing =
        "You kept While Using. Escrow and Always share only update while Trust Circle is open. Change to Always in iOS Settings so a look still works when the app is closed."

    public static let locationDeniedBody =
        "Location is off. You can still see people who share with you and look at them. Your pin waits until you allow While Using."

    public static let locationReducedAccuracy =
        "Approximate location is on. Escrow needs precise location."

    public static let weDoNotSellLocation =
        "We do not sell location. There are no ads and no data brokerage."

    public static let firstOpenLine = "Location stays with you until someone looks."
    public static let inviteLine = "I trust you with my location."
    public static let untilTheyLook = "Until they look"
    public static let always = "Always"
    public static let forAWhile = "For a while"
    public static let shareForAWhile = "Share for a while"

    public static func timedShareSentence(after: String, name: String, revertsToLook: Bool) -> String {
        if revertsToLook {
            return "\(after), \(name) will only see your location if they look — unless you’ve set something else for them."
        }
        return "\(after), \(name) goes back to Always — your current setting."
    }

    public static func timedRevertLine(revertsToLook: Bool) -> String {
        if revertsToLook {
            return "Goes back to Until they look — your current setting."
        }
        return "They keep seeing your live location. This timer does not switch them to Until they look."
    }

    public static func inviteMessage(code: String) -> String {
        "\(inviteLine)\nhttps://trust.collapsetechnologies.com/i/\(code)\ntrust://invite/\(code)"
    }
}
