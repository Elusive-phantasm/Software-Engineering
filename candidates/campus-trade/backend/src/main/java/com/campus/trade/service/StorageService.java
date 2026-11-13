package com.campus.trade.service;

import com.campus.trade.common.BizException;
import com.campus.trade.config.AppProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 图片存储。
 * 商品图落在 uploads/product（对外可访问）；
 * 学生证图落在 uploads/cert，**不**对外暴露，只能由管理员专用接口读取（NFR-08）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class StorageService {

    private static final Pattern DATA_URL = Pattern.compile("^data:(image/(png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=\\s]+)$");
    private static final Map<String, String> EXT = Map.of(
            "image/png", "png", "image/jpeg", "jpg", "image/jpg", "jpg",
            "image/webp", "webp", "image/gif", "gif");
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AppProperties props;

    /** 保存 data URL，返回可直接入库的相对路径 */
    public String saveDataUrl(String dataUrl, String kind) {
        if (dataUrl == null || dataUrl.isBlank()) {
            throw BizException.validate("请上传图片");
        }
        Matcher m = DATA_URL.matcher(dataUrl.trim());
        if (!m.matches()) {
            throw BizException.validate("图片格式不支持，请上传 PNG / JPG / WEBP / GIF");
        }
        String mime = m.group(1).toLowerCase(Locale.ROOT);
        String ext = EXT.get(mime);
        if (ext == null) {
            throw BizException.validate("图片格式不支持，请上传 PNG / JPG / WEBP / GIF");
        }
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(m.group(3).replaceAll("\\s", ""));
        } catch (IllegalArgumentException e) {
            throw BizException.validate("图片内容无法解析，请重新上传");
        }
        return saveBytes(bytes, ext, kind);
    }

    public String saveBytes(byte[] bytes, String ext, String kind) {
        if (bytes.length == 0) {
            throw BizException.validate("图片内容为空");
        }
        if (bytes.length > MAX_BYTES) {
            throw BizException.validate("图片超过 5MB 上限，请压缩后重试");
        }
        byte[] name = new byte[12];
        RANDOM.nextBytes(name);
        String fileName = HexFormat.of().formatHex(name) + "." + ext;
        try {
            Path dir = Paths.get(props.getStorage().getUploadDir(), kind).toAbsolutePath().normalize();
            Files.createDirectories(dir);
            Files.write(dir.resolve(fileName), bytes);
        } catch (IOException e) {
            log.error("保存图片失败", e);
            throw BizException.of(com.campus.trade.common.ErrorCode.INTERNAL, "图片保存失败，请重试");
        }
        return "cert".equals(kind)
                ? "/secure/cert/" + fileName
                : props.getStorage().getPublicPrefix() + "/" + fileName;
    }

    /** 解析学生证图片的磁盘路径（仅供管理员接口调用） */
    public Path certFile(String relPath) {
        if (relPath == null || relPath.isBlank()) {
            throw BizException.notFound("学生证图片不存在");
        }
        Path file = Paths.get(props.getStorage().getUploadDir(), "cert", Paths.get(relPath).getFileName().toString())
                .toAbsolutePath().normalize();
        if (!Files.exists(file)) {
            throw BizException.notFound("学生证图片不存在");
        }
        return file;
    }

    public String contentTypeOf(String relPath) {
        String name = relPath == null ? "" : relPath.toLowerCase(Locale.ROOT);
        if (name.endsWith(".png")) {
            return "image/png";
        }
        if (name.endsWith(".webp")) {
            return "image/webp";
        }
        if (name.endsWith(".gif")) {
            return "image/gif";
        }
        return "image/jpeg";
    }
}
