package main

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"timeful/server/models"
)

func TestBuildAccountMapsLegacyProfile(t *testing.T) {
	custom := true
	user := models.User{
		Id:               primitive.NewObjectID(),
		Email:            "  Ada@Example.com ",
		FirstName:        "Ada",
		LastName:         "Lovelace",
		Picture:          "https://example.com/ada.png",
		HasCustomName:    &custom,
		TimezoneOffset:   330,
		NumEventsCreated: 4,
	}

	account := buildAccount(user)
	if account.Email != "Ada@Example.com" {
		t.Fatalf("email = %q, want trimmed", account.Email)
	}
	if account.FirstName != "Ada" || account.LastName != "Lovelace" {
		t.Fatalf("name = %q %q", account.FirstName, account.LastName)
	}
	if account.Picture != "https://example.com/ada.png" {
		t.Fatalf("picture = %q", account.Picture)
	}
	if account.HasCustomName == nil || !*account.HasCustomName {
		t.Fatalf("hasCustomName = %v", account.HasCustomName)
	}
	if account.TimezoneOffset != 330 || account.NumEventsCreated != 4 {
		t.Fatalf("counters = %d %d", account.TimezoneOffset, account.NumEventsCreated)
	}
}

func TestBuildAccountPreservesAbsentCustomName(t *testing.T) {
	account := buildAccount(models.User{Email: "ada@example.com"})
	if account.HasCustomName != nil {
		t.Fatalf("absent hasCustomName must stay nil, got %v", account.HasCustomName)
	}
}

func TestPageFilterPagination(t *testing.T) {
	if len(pageFilter(primitive.NilObjectID, false)) != 0 {
		t.Fatal("the first page must not filter by _id")
	}
	lastID := primitive.NewObjectID()
	filter := pageFilter(lastID, true)
	value, ok := filter["_id"].(primitive.M)
	if !ok {
		t.Fatalf("unexpected filter %#v", filter)
	}
	if value["$gt"] != lastID {
		t.Fatalf("filter = %#v, want _id > %s", filter, lastID.Hex())
	}
}

// TestPageFilterTreatsZeroIdentifierAsCursor proves that a zero ObjectID is a
// real cursor rather than the "no page read yet" sentinel. Otherwise a source
// document with a zero identifier would re-read the first page forever.
func TestPageFilterTreatsZeroIdentifierAsCursor(t *testing.T) {
	filter := pageFilter(primitive.NilObjectID, true)
	value, ok := filter["_id"].(primitive.M)
	if !ok {
		t.Fatalf("unexpected filter %#v", filter)
	}
	if value["$gt"] != primitive.NilObjectID {
		t.Fatalf("filter = %#v, want _id > zero", filter)
	}
}
