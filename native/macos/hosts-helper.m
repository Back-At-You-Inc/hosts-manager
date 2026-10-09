#import <Foundation/Foundation.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/stat.h>
#include <sys/file.h>
#include <arpa/inet.h>
#include <copyfile.h>
#include <fcntl.h>
#include <unistd.h>
#include <signal.h>

#ifndef HOSTS_HELPER_VERSION
#define HOSTS_HELPER_VERSION "development"
#endif
static const NSUInteger LIMIT = 2 * 1024 * 1024;
static NSString *fail(NSString *message) { return message; }

// Match the renderer's section format, preserving all bytes outside managed sections.
static NSString *baseContent(NSString *text, NSString **error) {
    NSMutableString *base = [NSMutableString string];
    NSString *section = nil;
    NSArray *lines = [text componentsSeparatedByString:@"\n"];
    for (NSUInteger i = 0; i < lines.count; i++) {
        NSString *line = lines[i];
        NSString *clean = [line hasSuffix:@"\r"] ? [line substringToIndex:line.length - 1] : line;
        NSArray *suffixes = @[@"", @" (before system)", @" (after system)"];
        BOOL marker = NO;
        for (NSString *suffix in suffixes) {
            if ([clean isEqualToString:[@"# >>> Hosts Manager" stringByAppendingString:suffix]]) {
                if (section != nil) { *error = fail(@"Malformed managed section."); return nil; }
                section = suffix; marker = YES; break;
            }
            if ([clean isEqualToString:[@"# <<< Hosts Manager" stringByAppendingString:suffix]]) {
                if (section == nil || ![section isEqualToString:suffix]) { *error = fail(@"Malformed managed section."); return nil; }
                section = nil; marker = YES; break;
            }
        }
        if (!marker && section == nil) {
            [base appendString:line];
            if (i + 1 < lines.count) [base appendString:@"\n"];
        } else if (!marker && section != nil) {
            NSString *entry = [[clean componentsSeparatedByString:@"#"][0] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceCharacterSet];
            if (entry.length == 0) continue;
            NSMutableArray *fields = [NSMutableArray array];
            for (NSString *field in [entry componentsSeparatedByCharactersInSet:NSCharacterSet.whitespaceCharacterSet]) if (field.length) [fields addObject:field];
            unsigned char address[16];
            if (fields.count < 2 || (!inet_pton(AF_INET, [fields[0] UTF8String], address) && !inet_pton(AF_INET6, [fields[0] UTF8String], address))) {
                *error = fail(@"Invalid managed hosts entry."); return nil;
            }
            NSCharacterSet *invalid = [[NSCharacterSet characterSetWithCharactersInString:@"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"] invertedSet];
            for (NSUInteger h = 1; h < fields.count; h++) if ([fields[h] rangeOfCharacterFromSet:invalid].location != NSNotFound) { *error = fail(@"Invalid hostname."); return nil; }
        }
    }
    if (section != nil) { *error = fail(@"Malformed managed section."); return nil; }
    return base;
}

static NSString *updateHosts(NSString *target, NSDictionary *request) {
    NSString *original = request[@"original"], *replacement = request[@"replacement"];
    if (![original isKindOfClass:NSString.class] || ![replacement isKindOfClass:NSString.class] || [original lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > LIMIT || [replacement lengthOfBytesUsingEncoding:NSUTF8StringEncoding] > LIMIT) return @"Invalid update request.";
    NSString *error = nil;
    NSString *before = baseContent(original, &error);
    if (!before) return error;
    NSString *after = baseContent(replacement, &error);
    if (!after) return error;
    // A separator newline may be needed when appending to an unterminated system file.
    if (![request[@"operation"] isEqual:@"save-system"] && ![before isEqualToString:after] && !(![before hasSuffix:@"\n"] && [after isEqualToString:[before stringByAppendingString:[original containsString:@"\r\n"] ? @"\r\n" : @"\n"]])) return @"The helper cannot change existing system entries.";
    if ([request[@"operation"] isEqual:@"save-system"]) {
        NSString *checked = baseContent([NSString stringWithFormat:@"# >>> Hosts Manager\n%@\n# <<< Hosts Manager\n", after], &error);
        if (!checked) return error;
    }
    int fd = open(target.fileSystemRepresentation, O_RDONLY | O_NOFOLLOW);
    if (fd < 0) return @"Cannot read system hosts file.";
    struct stat info;
    if (fstat(fd, &info) || !S_ISREG(info.st_mode) || info.st_size < 0 || (NSUInteger)info.st_size > LIMIT || flock(fd, LOCK_EX)) { close(fd); return @"Invalid system hosts file."; }
    NSData *current = [NSData dataWithContentsOfFile:target];
    NSData *expected = [original dataUsingEncoding:NSUTF8StringEncoding];
    if (![current isEqualToData:expected]) { close(fd); return @"The system hosts file changed. Apply again."; }
    if ([original isEqualToString:replacement]) { close(fd); return nil; }
    NSString *backup = [target stringByAppendingString:@".hosts-manager.bak"];
    NSString *temporary = [target stringByAppendingFormat:@".hosts-manager-%@", NSUUID.UUID.UUIDString];
    int out = open(temporary.fileSystemRepresentation, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0600);
    if (out < 0) { close(fd); return @"Cannot create hosts update."; }
    NSString *backupTemporary = [temporary stringByAppendingString:@".backup"];
    if (copyfile(target.fileSystemRepresentation, backupTemporary.fileSystemRepresentation, NULL, COPYFILE_ALL | COPYFILE_EXCL) != 0 || rename(backupTemporary.fileSystemRepresentation, backup.fileSystemRepresentation) != 0) {
        unlink(backupTemporary.fileSystemRepresentation); close(out); unlink(temporary.fileSystemRepresentation); close(fd); return @"Cannot back up system hosts file.";
    }
    NSData *bytes = [replacement dataUsingEncoding:NSUTF8StringEncoding];
    NSUInteger offset = 0;
    while (offset < bytes.length) {
        ssize_t count = write(out, (const char *)bytes.bytes + offset, bytes.length - offset);
        if (count <= 0) break;
        offset += (NSUInteger)count;
    }
    BOOL ok = offset == bytes.length && fcopyfile(fd, out, NULL, COPYFILE_METADATA) == 0 && fchmod(out, info.st_mode & 0777) == 0 && fchown(out, info.st_uid, info.st_gid) == 0 && fsync(out) == 0;
    close(out);
    // Refuse to replace an externally edited file, including edits during staging.
    ok = ok && [[NSData dataWithContentsOfFile:target] isEqualToData:expected];
    if (ok) ok = rename(temporary.fileSystemRepresentation, target.fileSystemRepresentation) == 0;
    unlink(temporary.fileSystemRepresentation); close(fd);
    return ok ? nil : @"Hosts update failed or the system file changed. Apply again.";
}

static BOOL sendAll(int client, NSData *data) {
    NSUInteger offset = 0;
    while (offset < data.length) { ssize_t count = write(client, (const char *)data.bytes + offset, data.length - offset); if (count <= 0) return NO; offset += count; }
    return YES;
}
static void serve(int client, uid_t allowedUID) {
    uid_t peer; gid_t group;
    if (getpeereid(client, &peer, &group) || peer != allowedUID) return;
    struct timeval timeout = { 10, 0 };
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    NSMutableData *input = [NSMutableData data];
    char buffer[8192]; BOOL complete = NO;
    while (input.length <= LIMIT * 2 + 4096) {
        ssize_t count = read(client, buffer, sizeof(buffer));
        if (count <= 0) break;
        [input appendBytes:buffer length:(NSUInteger)count];
        if (memchr(buffer, '\n', (size_t)count)) { complete = YES; break; }
    }
    NSDictionary *request = complete ? [NSJSONSerialization JSONObjectWithData:input options:0 error:nil] : nil;
    NSString *error = @"Invalid helper request.";
    if ([request isKindOfClass:NSDictionary.class]) {
        if ([request[@"operation"] isEqual:@"ping"]) error = nil;
        else if ([request[@"operation"] isEqual:@"apply"] || [request[@"operation"] isEqual:@"save-system"]) error = updateHosts(@"/etc/hosts", request);
    }
    NSDictionary *response = error ? @{@"ok": @NO, @"message": error, @"version": @HOSTS_HELPER_VERSION} : @{@"ok": @YES, @"version": @HOSTS_HELPER_VERSION};
    NSMutableData *data = [[NSJSONSerialization dataWithJSONObject:response options:0 error:nil] mutableCopy];
    [data appendBytes:"\n" length:1]; sendAll(client, data);
}

static int selfTest(void) {
    NSString *error = nil;
    NSString *base = @"127.0.0.1 localhost\n";
    NSString *managed = @"# >>> Hosts Manager (before system)\n127.0.0.1 app.local\n# <<< Hosts Manager (before system)\n127.0.0.1 localhost\n";
    if (![baseContent(managed, &error) isEqual:base]) return 1;
    if (baseContent(@"# >>> Hosts Manager\ninvalid entry\n# <<< Hosts Manager\n", &error) != nil) return 2;
    NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    [[NSFileManager defaultManager] createDirectoryAtPath:directory withIntermediateDirectories:NO attributes:nil error:nil];
    NSString *target = [directory stringByAppendingPathComponent:@"hosts"];
    [base writeToFile:target atomically:YES encoding:NSUTF8StringEncoding error:nil];
    if (updateHosts(target, @{@"original":base, @"replacement":managed}) != nil) return 3;
    if (![[NSString stringWithContentsOfFile:target encoding:NSUTF8StringEncoding error:nil] isEqual:managed]) return 4;
    if (updateHosts(target, @{@"original":managed, @"replacement":@"127.0.0.1 changed.local\n"}) == nil) return 5;
    if (updateHosts(target, @{@"original":base, @"replacement":managed}) == nil) return 6;
    if (updateHosts(target, @{@"original":managed, @"replacement":base}) != nil) return 7;
    NSString *edited = @"127.0.0.1 edited.local\n";
    if (updateHosts(target, @{@"operation":@"save-system", @"original":base, @"replacement":edited}) != nil) return 13;
    if (updateHosts(target, @{@"operation":@"save-system", @"original":edited, @"replacement":@"invalid entry\n"}) == nil) return 14;
    [[NSFileManager defaultManager] removeItemAtPath:directory error:nil];
    int peers[2];
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, peers) != 0) return 8;
    sendAll(peers[0], [@"{\"operation\":\"ping\"}\n" dataUsingEncoding:NSUTF8StringEncoding]);
    serve(peers[1], getuid());
    char response[4096]; ssize_t count = recv(peers[0], response, sizeof(response), MSG_DONTWAIT);
    if (count <= 0) return 9;
    NSDictionary *reply = [NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:response length:(NSUInteger)count] options:0 error:nil];
    if (![reply[@"ok"] boolValue]) return 10;
    close(peers[0]); close(peers[1]);
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, peers) != 0) return 11;
    sendAll(peers[0], [@"{\"operation\":\"ping\"}\n" dataUsingEncoding:NSUTF8StringEncoding]);
    serve(peers[1], getuid() + 1);
    if (recv(peers[0], response, sizeof(response), MSG_DONTWAIT) >= 0) return 12;
    close(peers[0]); close(peers[1]);
    puts("Native helper self-test passed (temporary files and socket authorization only)."); return 0;
}

int main(int argc, char **argv) {
    @autoreleasepool {
        if (argc == 2 && strcmp(argv[1], "--self-test") == 0) return selfTest();
        if (geteuid() != 0 || argc != 2) return 1;
        char *end = NULL; unsigned long parsed = strtoul(argv[1], &end, 10);
        if (!end || *end || parsed == 0 || parsed > UINT_MAX) return 1;
        uid_t uid = (uid_t)parsed;
        signal(SIGPIPE, SIG_IGN); umask(077);
        NSString *socketPath = [NSString stringWithFormat:@"/var/run/hosts-manager-%u.sock", uid];
        int server = socket(AF_UNIX, SOCK_STREAM, 0);
        struct sockaddr_un address = {0}; address.sun_family = AF_UNIX;
        strlcpy(address.sun_path, socketPath.fileSystemRepresentation, sizeof(address.sun_path));
        unlink(address.sun_path);
        if (server < 0 || bind(server, (struct sockaddr *)&address, sizeof(address)) || chown(address.sun_path, uid, 0) || chmod(address.sun_path, 0600) || listen(server, 8)) return 1;
        for (;;) { int client = accept(server, NULL, NULL); if (client < 0) continue; @autoreleasepool { serve(client, uid); close(client); } }
    }
}
