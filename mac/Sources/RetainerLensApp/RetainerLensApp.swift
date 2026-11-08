import SwiftUI
import UniformTypeIdentifiers
import RetainerCore

extension UTType {
    static let retainerArchive = UTType(exportedAs: "com.retainerlens.review", conformingTo: .json)
}

struct ReviewDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.retainerArchive, .json] }
    static var writableContentTypes: [UTType] { [.retainerArchive] }
    var archive: AccountArchive
    init(archive: AccountArchive = AccountArchive()) { self.archive = archive }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        archive = try AccountArchive.decode(data)
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: try archive.encoded())
    }
}

@main
struct RetainerLensApp: App {
    var body: some Scene {
        DocumentGroup(newDocument: ReviewDocument()) { file in
            ReviewWorkspace(document: file.$document)
                .frame(minWidth: 980, minHeight: 640)
                .tint(Color(red: 0.62, green: 0.25, blue: 0.15))
        }
        .defaultSize(width: 1160, height: 760)
        .commands {
            CommandGroup(after: .help) {
                Link("RetainerLens private web preview", destination: URL(string: "https://retainerlens-studio.marco-anderson2011.chatgpt.site")!)
            }
        }
    }
}
