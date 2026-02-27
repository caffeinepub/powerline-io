import Array "mo:core/Array";
import Order "mo:core/Order";
import Map "mo:core/Map";
import Text "mo:core/Text";
import Runtime "mo:core/Runtime";

actor {
  type ScoreEntry = {
    name : Text;
    score : Nat;
  };

  module ScoreEntry {
    public func compare(a : ScoreEntry, b : ScoreEntry) : Order.Order {
      Nat.compare(b.score, a.score);
    };
  };

  let scores = Map.empty<Text, ScoreEntry>();

  public shared ({ caller }) func submitScore(name : Text, score : Nat) : async () {
    if (name.isEmpty()) {
      Runtime.trap("Name cannot be empty");
    };
    let newEntry : ScoreEntry = { name; score };
    scores.add(name, newEntry);
  };

  public query ({ caller }) func getTopScores() : async [ScoreEntry] {
    let allScores = scores.values().toArray();
    let sortedScores = allScores.sort();
    sortedScores.sliceToArray(0, if (sortedScores.size() < 10) { sortedScores.size() } else { 10 });
  };
};
