import SwiftUI
import RetainerCore

private let paper = Color(red: 0.97, green: 0.96, blue: 0.93)
private let ink = Color(red: 0.17, green: 0.20, blue: 0.18)
private let rust = Color(red: 0.62, green: 0.25, blue: 0.15)

private struct ClientDraft: Identifiable {
    let id = UUID()
    var row: Client
    var originalName: String?
}

struct ReviewWorkspace: View {
    @Binding var document: ReviewDocument
    @State private var selection: String?
    @State private var selectedClient: String?
    @State private var clientDraft: ClientDraft?
    @State private var showReviewSettings = false
    @State private var isNewReview = false
    @State private var showTrashConfirmation = false
    @State private var showRemoveConfirmation = false
    @State private var errorMessage: String?
    private var current: Review? { (document.archive.reviews + document.archive.trash).first { $0.id == selection } }
    private var inTrash: Bool { current?.deletedAt != nil }

    var body: some View {
        NavigationSplitView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("RetainerLens").font(.system(size: 24, weight: .semibold, design: .serif))
                    Text("THE MONTHLY REVIEW").font(.system(size: 10, weight: .semibold)).tracking(1.7).foregroundStyle(.secondary)
                }.padding(22)
                List(selection: $selection) {
                    Section("Reviews") {
                        ForEach(document.archive.reviews.sorted { $0.id > $1.id }) { review in sidebarRow(review) }
                    }
                    if !document.archive.trash.isEmpty {
                        Section("Trash") { ForEach(document.archive.trash.sorted { $0.id > $1.id }) { review in sidebarRow(review) } }
                    }
                }.listStyle(.sidebar)
                VStack(alignment: .leading, spacing: 5) {
                    Label("Local document", systemImage: "internaldrive").font(.callout.weight(.medium))
                    Text("Save with ⌘S. Account sync is not connected in this preview.").font(.caption).foregroundStyle(.secondary)
                }.padding(20)
            }.navigationSplitViewColumnWidth(min: 210, ideal: 230, max: 280)
        } detail: {
            if let review = current { reviewDetail(review) } else { welcome }
        }
        .toolbar {
            ToolbarItemGroup {
                Button { isNewReview = true; showReviewSettings = true } label: { Label("New review", systemImage: "plus") }
                    .keyboardShortcut("n", modifiers: [.command, .shift])
                if current != nil {
                    if inTrash {
                        Button("Restore review") { perform { try document.archive.restore(id: selection!) } }
                    } else {
                        Button("Review settings") { isNewReview = false; showReviewSettings = true }
                        Button { showTrashConfirmation = true } label: { Label("Move review to Trash", systemImage: "trash") }
                    }
                }
            }
        }
        .sheet(item: $clientDraft) { draft in
            ClientEditor(row: draft.row) { row in
                guard var review = current, !inTrash else { return "Choose an active review first." }
                if let name = draft.originalName, let i = review.rows.firstIndex(where: { $0.client == name }) { review.rows[i] = row }
                else { review.rows.append(row) }
                do { try document.archive.replace(review, originalID: review.id); selectedClient = row.client.trimmingCharacters(in: .whitespacesAndNewlines); return nil }
                catch { return error.localizedDescription }
            }
        }
        .sheet(isPresented: $showReviewSettings) {
            ReviewSettings(review: isNewReview ? nil : current) { month, currency, target in
                let original = isNewReview ? nil : current
                var review = original ?? Review(month: month, currency: currency, target: target,
                    rows: [Client(client: "New client", fee: 0, hours: 0, rate: 0, other: 0)])
                review.month = month; review.currency = currency; review.target = target
                do { try document.archive.replace(review, originalID: original?.id); selection = review.id; return nil }
                catch { return error.localizedDescription }
            }
        }
        .confirmationDialog("Move this review to Trash?", isPresented: $showTrashConfirmation, titleVisibility: .visible) {
            Button("Move to Trash", role: .destructive) { perform { if let selection { try document.archive.moveToTrash(id: selection) } } }
        } message: { Text("You can restore it from this document’s Trash. This does not change your web account.") }
        .confirmationDialog("Remove this client from the local review?", isPresented: $showRemoveConfirmation, titleVisibility: .visible) {
            Button("Remove client", role: .destructive) {
                perform {
                    guard var review = current, !inTrash, review.rows.count > 1 else { return }
                    review.rows.removeAll { $0.client == selectedClient }
                    try document.archive.replace(review, originalID: review.id); selectedClient = nil
                }
            }
        } message: { Text("This removes only the selected client from this month’s local document.") }
        .alert("Couldn’t update the review", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: { Text(errorMessage ?? "") }
        .onAppear { selection = document.archive.reviews.sorted { $0.id > $1.id }.first?.id }
        .onChange(of: selection) { _, _ in selectedClient = nil }
        .preferredColorScheme(.light)
    }

    private func sidebarRow(_ review: Review) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(review.month).font(.system(.body, design: .monospaced).weight(.medium))
            Text("\(review.currency) · \(review.rows.count) clients").font(.caption).foregroundStyle(.secondary)
        }.padding(.vertical, 5).tag(review.id)
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text("A clearer view of\nyour retainers.").font(.system(size: 45, weight: .regular, design: .serif)).foregroundStyle(ink)
            Text("Review the work behind each monthly fee.").font(.title3).foregroundStyle(.secondary)
            Divider()
            Text("Start a review, or use File → Open to bring in the JSON account export from RetainerLens on the web.")
                .font(.body).lineSpacing(5).frame(maxWidth: 470, alignment: .leading)
            HStack(spacing: 12) {
                Button("Create a review") { isNewReview = true; showReviewSettings = true }.buttonStyle(.borderedProminent)
                if document.archive.reviews.isEmpty && document.archive.trash.isEmpty {
                    Button("Explore fictional example") { document.archive = .example; selection = document.archive.reviews.first?.id }
                }
            }
            Text("DESKTOP PREVIEW · LOCAL FILES ONLY").font(.system(size: 10, weight: .semibold)).tracking(1.4).foregroundStyle(.secondary)
        }.padding(60).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).background(paper)
    }

    private func reviewDetail(_ review: Review) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("MONTHLY DELIVERY REVIEW").font(.system(size: 10, weight: .semibold)).tracking(1.6).foregroundStyle(.secondary)
                        Text(monthTitle(review.month)).font(.system(size: 36, weight: .regular, design: .serif))
                    }
                    Spacer()
                    Text(inTrash ? "In Trash" : review.localEdited == true ? "Local changes" : "Imported snapshot")
                        .font(.caption.weight(.medium)).padding(.horizontal, 12).padding(.vertical, 7).background(.white.opacity(0.7), in: Capsule())
                }
                if let totals = try? review.totals() {
                    HStack(spacing: 0) {
                        metric("MONTHLY FEES", money(totals.fee, review.currency))
                        metric("DELIVERY PROFIT", money(totals.profit, review.currency))
                        metric("PORTFOLIO MARGIN", percent(totals.margin))
                        metric("TARGET", "\(review.target)%")
                    }.padding(.vertical, 16)
                }
                HStack {
                    Text("Client ledger").font(.system(size: 19, weight: .medium, design: .serif))
                    Spacer()
                    Button("Edit client") { editSelected(review) }.disabled(selectedClient == nil || inTrash)
                    Button("Remove client") { showRemoveConfirmation = true }.disabled(selectedClient == nil || inTrash || review.rows.count <= 1)
                    Button("Add client") { clientDraft = ClientDraft(row: Client(client: "", fee: 0, hours: 0, rate: 0, other: 0)) }
                        .disabled(inTrash || review.rows.count >= 500)
                }
            }.padding(.horizontal, 32).padding(.top, 28).padding(.bottom, 16)
            Table(review.rows, selection: $selectedClient) {
                TableColumn("Client") { row in Text(row.client).fontWeight(.medium) }.width(min: 150, ideal: 190)
                TableColumn("Monthly fee") { row in number(money(row.fee, review.currency)) }.width(min: 100, ideal: 115)
                TableColumn("Hours") { row in number(row.hours.formatted(.number.precision(.fractionLength(0...2)))) }.width(65)
                TableColumn("Delivery cost") { row in number(money((try? row.calculate(target: review.target).cost) ?? 0, review.currency)) }.width(min: 100, ideal: 115)
                TableColumn("Profit") { row in number(money((try? row.calculate(target: review.target).profit) ?? 0, review.currency)) }.width(min: 95, ideal: 110)
                TableColumn("Margin") { row in
                    let margin = try? row.calculate(target: review.target).margin
                    Text(percent(margin)).monospacedDigit().foregroundStyle((margin ?? 0) < Double(review.target) ? rust : ink)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }.width(75)
            }
            .contextMenu(forSelectionType: String.self) { names in
                if let name = names.first, let row = review.rows.first(where: { $0.client == name }), !inTrash {
                    Button("Edit client") { clientDraft = ClientDraft(row: row, originalName: name) }
                }
            } primaryAction: { names in
                if let name = names.first, let row = review.rows.first(where: { $0.client == name }), !inTrash { clientDraft = ClientDraft(row: row, originalName: name) }
            }
            .padding(.horizontal, 24)
            if let row = review.rows.first(where: { $0.client == selectedClient }), let calculation = try? row.calculate(target: review.target) {
                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("At your \(review.target)% target").font(.callout.weight(.semibold))
                        Text("\(row.client) needs a monthly fee of \(money(calculation.targetFee, review.currency)) at the current delivery cost.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let hours = calculation.hourBudget {
                        VStack(alignment: .trailing, spacing: 6) {
                            Text("\(hours.formatted(.number.precision(.fractionLength(1)))) hours").font(.title3.monospacedDigit())
                            Text("Delivery budget at current fee").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }.padding(20).background(.white.opacity(0.6)).padding(.horizontal, 32).padding(.top, 14)
            }
            Text("Delivery profit excludes overhead, tax and acquisition costs. \(review.currency) amounts are not converted. Changes stay in this local document.")
                .font(.caption).foregroundStyle(.secondary).padding(.horizontal, 32).padding(.vertical, 18)
        }.foregroundStyle(ink).background(paper)
    }

    private func metric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(title).font(.system(size: 9, weight: .semibold)).tracking(1.1).foregroundStyle(.secondary)
            Text(value).font(.system(size: 26, weight: .regular, design: .serif)).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func number(_ value: String) -> some View { Text(value).monospacedDigit().frame(maxWidth: .infinity, alignment: .trailing) }
    private func editSelected(_ review: Review) {
        if let row = review.rows.first(where: { $0.client == selectedClient }) { clientDraft = ClientDraft(row: row, originalName: row.client) }
    }
    private func perform(_ operation: () throws -> Void) { do { try operation() } catch { errorMessage = error.localizedDescription } }
}

private func money(_ amount: Double, _ currency: String) -> String { amount.formatted(.currency(code: currency).precision(.fractionLength(0...2))) }
private func percent(_ value: Double?) -> String { value.map { $0.formatted(.number.precision(.fractionLength(1))) + "%" } ?? "—" }
private func monthTitle(_ month: String) -> String {
    let parser = DateFormatter(); parser.locale = Locale(identifier: "en_US_POSIX"); parser.dateFormat = "yyyy-MM"; parser.timeZone = TimeZone(secondsFromGMT: 0)
    guard let date = parser.date(from: month) else { return month }
    parser.dateFormat = "MMMM yyyy"; return parser.string(from: date)
}

private struct ClientEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var fee: String
    @State private var hours: String
    @State private var rate: String
    @State private var other: String
    init(row: Client, save: @escaping (Client) -> String?) {
        _name = State(initialValue: row.client); _fee = State(initialValue: String(row.fee))
        _hours = State(initialValue: String(row.hours)); _rate = State(initialValue: String(row.rate))
        _other = State(initialValue: String(row.other)); self.save = save
    }
    var save: (Client) -> String?
    @State private var error: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Client economics").font(.system(size: 28, design: .serif))
            Form {
                TextField("Client name", text: $name)
                TextField("Monthly fee", text: $fee)
                TextField("Delivered hours", text: $hours)
                TextField("Cost per delivery hour", text: $rate)
                TextField("Other direct costs", text: $other)
            }.textFieldStyle(.roundedBorder)
            Text("Use your cost of delivering the work, not the rate you charge the client.").font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).font(.callout).foregroundStyle(.red) }
            HStack { Spacer(); Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button("Save client") {
                    let fields = [fee, hours, rate, other].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                    guard fields.allSatisfy({ $0.range(of: #"^\d+(\.\d+)?$"#, options: .regularExpression) != nil }),
                          let feeValue = Double(fields[0]), let hoursValue = Double(fields[1]),
                          let rateValue = Double(fields[2]), let otherValue = Double(fields[3]) else {
                        error = "Use plain non-negative numbers, with a dot for decimals."; return
                    }
                    error = save(Client(client: name, fee: feeValue, hours: hoursValue, rate: rateValue, other: otherValue))
                    if error == nil { dismiss() }
                }.keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent) }
        }.padding(28).frame(width: 450)
    }
}

private struct ReviewSettings: View {
    @Environment(\.dismiss) private var dismiss
    @State private var month: String
    @State private var currency: String
    @State private var target: String
    @State private var error: String?
    private var creating: Bool
    var save: (String, String, Int) -> String?
    init(review: Review?, save: @escaping (String, String, Int) -> String?) {
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy-MM"; formatter.locale = Locale(identifier: "en_US_POSIX")
        _month = State(initialValue: review?.month ?? formatter.string(from: Date()))
        _currency = State(initialValue: review?.currency ?? "USD"); _target = State(initialValue: String(review?.target ?? 50))
        creating = review == nil; self.save = save
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text(creating ? "New monthly review" : "Review settings").font(.system(size: 28, design: .serif))
            Form {
                TextField("Month (YYYY-MM)", text: $month)
                Picker("Currency", selection: $currency) { ForEach(Review.currencies, id: \.self) { Text($0).tag($0) } }
                TextField("Margin target (%)", text: $target)
            }.textFieldStyle(.roundedBorder)
            Text("Currency changes labels only. Amounts are never converted.").font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).foregroundStyle(.red).font(.callout) }
            HStack { Spacer(); Button("Cancel") { dismiss() }.keyboardShortcut(.cancelAction)
                Button(creating ? "Create review" : "Save settings") { guard let value = Int(target), (0...99).contains(value) else { error = "Use a whole-number target from 0–99%."; return }
                    error = save(month, currency, value); if error == nil { dismiss() } }
                    .keyboardShortcut(.defaultAction).buttonStyle(.borderedProminent) }
        }.padding(28).frame(width: 430)
    }
}
