import SwiftUI
import TrustCore

struct PersonShareSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette

    var body: some View {
        let person = model.shareSubject
        let name = person?.identity ?? TrustCopy.them
        let state = person.map { model.shareState(for: $0.id) } ?? PersonShareState()
        let now = Date()
        let presentation = state.presentation(at: now)

        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                TrustPanelHeading(eyebrow: name, title: TrustCopy.whatNameCanSee(name: name)) {
                    model.showingShareSheet = false
                }
                .padding(.bottom, 12)

                Text(TrustCopy.shareSheetIntro)
                    .font(TrustTheme.ui(15))
                    .foregroundStyle(palette.muted)
                    .padding(.bottom, 20)

                shareChoice(
                    title: TrustCopy.untilTheyLook,
                    tag: TrustCopy.tagDefault,
                    body: TrustCopy.untilTheyLookBody(name: name),
                    selected: {
                        if case .untilTheyLook = presentation { return true }
                        return false
                    }()
                ) {
                    if let id = person?.id {
                        model.setUntilTheyLook(personID: id)
                    }
                    model.showingShareSheet = false
                }

                shareChoice(
                    title: TrustCopy.always,
                    tag: TrustCopy.tagException,
                    body: TrustCopy.alwaysBody(name: name),
                    selected: {
                        if case .always = presentation { return true }
                        return false
                    }()
                ) {
                    if let id = person?.id {
                        model.setAlways(personID: id)
                    }
                    model.showingShareSheet = false
                }

                shareChoice(
                    title: TrustCopy.forAWhile,
                    tag: TrustCopy.tagException,
                    body: TrustCopy.forAWhileBody(name: name),
                    selected: {
                        if case .timed = presentation { return true }
                        return false
                    }()
                ) {
                    model.showingTimedShare = true
                }

                Text(TrustCopy.shareModesFootnote)
                    .font(TrustTheme.ui(13))
                    .foregroundStyle(palette.muted)
                    .padding(.top, 22)
            }
            .padding(24)
        }
        .background(palette.paper.ignoresSafeArea())
    }

    private func shareChoice(
        title: String,
        tag: String,
        body: String,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 12) {
                Rectangle()
                    .fill(selected ? palette.accent : Color.clear)
                    .frame(width: 2)
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(title)
                            .font(TrustTheme.ui(16, weight: .semibold))
                            .foregroundStyle(palette.ink)
                        Spacer()
                        TrustFolio(text: tag, color: selected ? palette.accent : palette.muted, size: 10)
                    }
                    Text(body)
                        .font(TrustTheme.ui(13))
                        .foregroundStyle(palette.muted)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(.vertical, 12)
            .overlay(alignment: .bottom) { TrustHairline() }
        }
        .buttonStyle(.plain)
    }
}

struct TimedShareSheet: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.trustPalette) private var palette
    @State private var duration: TimedShareDuration = .hour

    var body: some View {
        let name = model.shareSubject?.identity ?? TrustCopy.them
        let state = model.shareSubject.map { model.shareState(for: $0.id) } ?? PersonShareState()
        let revertsToLook: Bool = {
            switch state.presentation(at: Date()) {
            case .always, .timed(_, .always):
                return false
            case .untilTheyLook, .timed(_, .untilTheyLook):
                return true
            }
        }()

        VStack(alignment: .leading, spacing: 0) {
            TrustPanelHeading(eyebrow: name, title: TrustCopy.forAWhile) {
                model.showingTimedShare = false
            }
            .padding(.bottom, 12)

            Text(TrustCopy.timedOverlayIntro(name: name))
                .font(TrustTheme.ui(15))
                .foregroundStyle(palette.muted)
                .padding(.bottom, 20)

            TrustFolio(text: TrustCopy.howLong, size: 10)
                .padding(.bottom, 10)

            HStack(spacing: 8) {
                ForEach(TimedShareDuration.allCases, id: \.self) { option in
                    Button(option.label.uppercased()) { duration = option }
                        .font(TrustTheme.folio(11))
                        .tracking(0.8)
                        .foregroundStyle(duration == option ? palette.accentOn : palette.ink)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 36)
                        .background(duration == option ? palette.accent : Color.clear)
                        .overlay(Rectangle().stroke(palette.line, lineWidth: 1))
                }
            }
            .padding(.bottom, 22)

            Text(TrustCopy.timedShareSentence(after: duration.afterPhrase, name: name, revertsToLook: revertsToLook))
                .font(TrustTheme.ui(16, weight: .medium))
                .foregroundStyle(palette.ink)
                .padding(.bottom, 10)

            Text(TrustCopy.timedRevertLine(revertsToLook: revertsToLook))
                .font(TrustTheme.ui(14))
                .foregroundStyle(palette.muted)

            Spacer()

            Button(TrustCopy.shareForAWhile) {
                if let id = model.shareSubject?.id {
                    model.setTimedShare(personID: id, duration: duration)
                }
                model.showingTimedShare = false
                model.showingShareSheet = false
            }
            .buttonStyle(TrustFilledButtonStyle())
        }
        .padding(24)
        .background(palette.paper.ignoresSafeArea())
    }
}
