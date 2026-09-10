package utils

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/brianvoe/sjwt"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/logger"
	"timeful/server/models"
	pgstore "timeful/server/postgres"
)

// Returns whether running on production server
func IsRelease() bool {
	mode := os.Getenv("GIN_MODE")
	return mode == "release"
}

func PrintJson(s interface{}) {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	fmt.Println(string(data))
}

func ParseJWT(jwt string) sjwt.Claims {
	claims, err := sjwt.Parse(jwt)
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	return claims
}

func StringToObjectID(s string) primitive.ObjectID {
	objectID, err := primitive.ObjectIDFromHex(s)
	if err != nil {
		logger.StdErr.Panicln(err)
	}

	return objectID
}

// Returns the currently signed in user
func GetAuthUser(c *gin.Context) *models.User {
	userInterface, _ := c.Get("authUser")
	user := userInterface.(*models.User)
	return user
}

// Returns the authoritative PostgreSQL account for the current session.
func GetAuthAccount(c *gin.Context) *pgstore.Account {
	accountInterface, ok := c.Get("authAccount")
	if !ok {
		return nil
	}
	account, _ := accountInterface.(*pgstore.Account)
	return account
}

// Gets the access token expire date from an "expiresIn" int representing the number of seconds
// after which the access token will expire
func GetAccessTokenExpireDate(expiresIn int) time.Time {
	expireDuration, err := time.ParseDuration(fmt.Sprintf("%ds", expiresIn))
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	return time.Now().Add(expireDuration)
}

// Returns the ISO date string for the given date
func GetDateString(date time.Time) string {
	s, _ := date.UTC().MarshalText()
	return string(s)[:10]
}

// Returns a time object with the given date and a time string in the form of "00:00:00"
func GetDateAtTime(date time.Time, timeString string) time.Time {
	utcDateString := GetDateString(date)
	newDate, err := time.Parse(time.RFC3339, fmt.Sprintf("%sT%sZ", utcDateString, timeString))
	if err != nil {
		logger.StdErr.Panicln(err)
	}
	return newDate
}

// Escapes regex for a string
func EscapeRegExp(str string) string {
	check := regexp.MustCompile(`([.*+?^${}()|[\]\\])`)
	return check.ReplaceAllString(str, "\\${1}")
}

// Returns the correct client id given the token origin
func GetClientIdFromTokenOrigin(tokenOrigin models.TokenOriginType) string {
	switch tokenOrigin {
	case models.ANDROID:
		return os.Getenv("ANDROID_CLIENT_ID")
	case models.IOS:
		return os.Getenv("IOS_CLIENT_ID")
	default:
		return os.Getenv("CLIENT_ID")
	}
}

// Prints the http response as a string
func PrintHttpResponse(resp *http.Response) {
	body, _ := io.ReadAll(resp.Body)
	logger.StdOut.Println(string(body))
	resp.Body = io.NopCloser(bytes.NewBuffer(body))
}

// GetBaseUrl returns the canonical public application origin for generated links.
func GetBaseUrl() string {
	baseUrl, err := normalizedBaseUrl(os.Getenv("APP_BASE_URL"))
	if err != nil {
		panic(err)
	}
	return baseUrl
}

func ValidateBaseUrl() error {
	_, err := normalizedBaseUrl(os.Getenv("APP_BASE_URL"))
	return err
}

// CORSOrigins returns the canonical application origin and any configured additional origins.
func CORSOrigins(additionalOrigins string) ([]string, error) {
	baseUrl, err := normalizedBaseUrl(os.Getenv("APP_BASE_URL"))
	if err != nil {
		return nil, err
	}

	origins := []string{baseUrl}
	seen := map[string]struct{}{baseUrl: {}}
	for _, origin := range strings.Split(additionalOrigins, ",") {
		if strings.TrimSpace(origin) == "" {
			continue
		}

		normalizedOrigin, err := normalizedBaseUrl(origin)
		if err != nil {
			return nil, fmt.Errorf("CORS_ORIGINS contains an invalid origin: %w", err)
		}
		if _, exists := seen[normalizedOrigin]; exists {
			continue
		}

		seen[normalizedOrigin] = struct{}{}
		origins = append(origins, normalizedOrigin)
	}

	return origins, nil
}

// GetListmonkOtpFromAddress returns the configured sender for Listmonk OTP emails.
func GetListmonkOtpFromAddress() (string, error) {
	fromAddress := strings.TrimSpace(os.Getenv("LISTMONK_OTP_FROM_ADDRESS"))
	if fromAddress == "" {
		return "", errors.New("LISTMONK_OTP_FROM_ADDRESS is required when sending OTP emails")
	}

	if _, err := mail.ParseAddress(fromAddress); err != nil {
		return "", fmt.Errorf("LISTMONK_OTP_FROM_ADDRESS is invalid: %w", err)
	}

	return fromAddress, nil
}

func normalizedBaseUrl(value string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", errors.New("APP_BASE_URL must be an absolute HTTP(S) origin")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("APP_BASE_URL must use the http or https scheme")
	}
	if parsed.User != nil || (parsed.Path != "" && parsed.Path != "/") || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("APP_BASE_URL must not include credentials, a path, query, or fragment")
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

// Returns the value of the first non nil pointer in `args`.
// Otherwise, just return the zero value
func Coalesce[T any](args ...*T) T {
	for _, val := range args {
		if val != nil {
			return *val
		}
	}

	var val T
	return val
}

// Return a pointer to true
func TruePtr() *bool {
	b := true
	return &b
}

// Return a pointer to false
func FalsePtr() *bool {
	b := false
	return &b
}

// NormalizeEmail returns the email in a canonical form for lookups and storage (trim + ASCII lower).
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// GetCalendarAccountKey builds the map key for calendarAccounts. Email-like identifiers are lowercased;
// ICS uses the feed label as the first segment and is only trimmed, not lowercased.
func GetCalendarAccountKey(ident string, calendarType models.CalendarType) string {
	keyPart := strings.TrimSpace(ident)
	if calendarType != models.ICSCalendarType {
		keyPart = NormalizeEmail(keyPart)
	}
	return fmt.Sprintf("%s_%s", keyPart, calendarType)
}

// ActualCalendarAccountMapKey returns the key already present in user.CalendarAccounts for this
// account, or "" if none. Prefer this over recomputing from email when reading legacy documents
// whose map keys used mixed-case emails.
func ActualCalendarAccountMapKey(user *models.User, ident string, calendarType models.CalendarType) string {
	if user == nil || user.CalendarAccounts == nil {
		return ""
	}
	canonical := GetCalendarAccountKey(ident, calendarType)
	if _, ok := user.CalendarAccounts[canonical]; ok {
		return canonical
	}
	for k, acc := range user.CalendarAccounts {
		if acc.CalendarType != calendarType {
			continue
		}
		if calendarType == models.ICSCalendarType {
			if strings.TrimSpace(acc.Email) == strings.TrimSpace(ident) {
				return k
			}
			continue
		}
		if NormalizeEmail(acc.Email) == NormalizeEmail(ident) {
			return k
		}
	}
	return ""
}

func GetPrimaryAccountKey(user *models.User) string {
	// Before primary account key was added, primary account was always the user's google calendar
	if user.PrimaryAccountKey == nil {
		return ActualCalendarAccountMapKey(user, user.Email, models.GoogleCalendarType)
	}

	return *user.PrimaryAccountKey
}

func Encode(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

func Decode(s string) []byte {
	data, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return data
}

// Encrypts the given text using the given secret
func Encrypt(text string) (string, error) {
	block, err := aes.NewCipher([]byte(os.Getenv("ENCRYPTION_KEY")))
	if err != nil {
		return "", err
	}
	plainText := []byte(text)
	cipherText := make([]byte, aes.BlockSize+len(plainText))
	iv := cipherText[:aes.BlockSize]
	if _, err := rand.Read(iv); err != nil {
		return "", err
	}
	cfb := cipher.NewCFBEncrypter(block, iv)
	cfb.XORKeyStream(cipherText[aes.BlockSize:], plainText)
	return Encode(cipherText), nil
}

// Decrypts the given text using the given secret
func Decrypt(text string) (string, error) {
	block, err := aes.NewCipher([]byte(os.Getenv("ENCRYPTION_KEY")))
	if err != nil {
		return "", err
	}
	cipherText := Decode(text)
	if len(cipherText) < aes.BlockSize {
		return "", errors.New("ciphertext too short")
	}
	iv := cipherText[:aes.BlockSize]
	cipherText = cipherText[aes.BlockSize:]
	cfb := cipher.NewCFBDecrypter(block, iv)
	plainText := make([]byte, len(cipherText))
	cfb.XORKeyStream(plainText, cipherText)
	return string(plainText), nil
}

// ConvertEventToOldFormat converts an event's responses from ResponsesList to ResponsesMap format
// for backward compatibility with older code
func ConvertEventToOldFormat(event *models.Event, eventResponses []models.EventResponse) {
	responsesMap := make(map[string]*models.Response)
	for _, resp := range eventResponses {
		responsesMap[resp.UserId] = resp.Response
	}
	event.ResponsesMap = responsesMap
}
